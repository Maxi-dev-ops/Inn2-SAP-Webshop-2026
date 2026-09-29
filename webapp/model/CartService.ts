import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import UIComponent from "sap/ui/core/UIComponent";
import Log from "sap/base/Log";
import Constants from "./Constants";
import { callOnce, errText, readList, removeOnce, updateOnce } from "./odata";
import {
    asText, checkText, FieldRule, hasAlphanumeric, hasLetter, isKnownCountry, isPostalCode,
    normalizeText
} from "./validation";

// One cart row. The backend stores exactly one unit per ShoppingCartItem ("Menge muss 1 sein"),
// so a row groups all positions of the same material and the quantity is their count.
export interface CartItem {
    // Catalog item UUID when known, otherwise the first backend position UUID
    uuid: string;
    // Needed to add another unit of this row
    catalogUuid?: string;
    // Backend positions behind this row, one per unit. Empty while unconfirmed.
    cartItemUuids: string[];
    // True while units of this row are not confirmed by the backend yet
    pending?: boolean;
    name: string;
    material: string;
    price: number;
    currency: string;
    pictureUrl: string;
    quantity: number;
}

export interface CartState {
    items?: CartItem[];
    count?: number;
    totalAmount?: number;
    totalCurrency?: string;
    cartUuid?: string;
}

// Aggregated cart numbers; one source of truth for cart summary, order and confirmation
export interface CartTotals {
    // Number of cart rows
    positionCount: number;
    // Sum of all quantities
    itemCount: number;
    pricedCount: number;
    unpricedCount: number;
    amount: number;
    currency: string;
    // True when the amount comes from the backend cart header instead of the item sum
    fromBackend: boolean;
}

export interface CatalogProduct {
    CatalogItemUuid: string;
    ProductName: string;
    Material: string;
    NetPriceAmount: number | string;
    TransactionCurrency: string;
    ProductPictureUrl: string;
}

// Writable header fields of the open cart. The shop has no payment step, so this is everything
// the user can add to an order: a reference, a remark and a deviating delivery address.
export interface CartHeaderFields {
    ExternalReference: string;
    Remark: string;
    DeliveryStreet: string;
    DeliveryCity: string;
    DeliveryPostalCode: string;
    DeliveryCountry: string;
}

// Anything that names a product by material; both CartItem and OrderItem satisfy it
export interface MaterialRef {
    catalogUuid?: string;
    material: string;
}

// One line to put back into the cart
export interface ReorderItem extends MaterialRef {
    name: string;
    quantity: number;
    price: number;
    currency: string;
}

// Outcome of a reorder; failed rows are named so the user learns what did not make it
export interface ReorderResult {
    added: number;
    // Product names whose material the catalog does not resolve, or whose add was refused
    failed: string[];
}

interface RawCartHeader extends Partial<CartHeaderFields> {
    ShoppingCartUuid?: string;
    NetAmount?: string;
    CurrencyCode?: string;
    ApproverStatus?: string;
    // Action control; verified 2026-09-01: true + ApproverStatus '1' while open, false + '5' once ordered
    orderShoppingCart_ac?: boolean;
    to_ShoppingCartItem?: { results?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
}

// The open cart as one answer: header fields plus its grouped positions
interface OpenCart {
    cartUuid: string;
    totalAmount: number;
    totalCurrency: string;
    // What is already stored on the cart, so the checkout page opens prefilled
    fields: CartHeaderFields;
    items: CartItem[];
}

// Name of one writable header field; keys HEADER_RULES and the form's per-field error state
export type HeaderField = keyof CartHeaderFields;

export default class CartService {
    // MaxLength comes from the service metadata; a longer value is answered with 400 and an EDM
    // facet error (verified 2026-09-01), so values are cut here and not only in the input fields.
    // The checks are ours: no field has a value list and the backend stores whatever fits - an
    // order in the system carries DeliveryCity ",," and DeliveryCountry "HGV" because nothing said no.
    public static readonly HEADER_RULES: Readonly<Record<HeaderField, FieldRule>> = {
        ExternalReference: { maxLength: 35, check: hasAlphanumeric, messageKey: "validationReference" },
        Remark: { maxLength: 256 },
        DeliveryStreet: { maxLength: 60, check: hasLetter, messageKey: "validationStreet" },
        DeliveryCity: { maxLength: 40, check: hasLetter, messageKey: "validationCity" },
        DeliveryPostalCode: { maxLength: 10, upperCase: true, check: isPostalCode, messageKey: "validationPostalCode" },
        DeliveryCountry: { maxLength: 3, upperCase: true, check: isKnownCountry, messageKey: "validationCountry" }
    };

    // Fields that only carry a meaning together: an address without a city is of no use
    private static readonly DELIVERY_FIELDS: HeaderField[] =
        ["DeliveryStreet", "DeliveryPostalCode", "DeliveryCity", "DeliveryCountry"];

    // Materials already looked up by enrichFromCatalog. An article the catalog answers 0 for will
    // not grow a price between two syncs, so without this every sync() asks again for nothing.
    private static readonly _enrichedMaterials = new Set<string>();

    private readonly _oComponent: UIComponent;

    // Shared across instances: every controller has its own service but one cart model
    private static _syncSeq = 0;
    // Counts running writes so overlapping ones do not clear the busy flag too early
    private static _busyCount = 0;

    public constructor(oComponent: UIComponent) {
        this._oComponent = oComponent;
    }

    // -- Internal model access -- //

    private _getCartModel(): JSONModel | null {
        return this._oComponent.getModel(Constants.MODELS.CART) as JSONModel | null;
    }

    private _getCartODataModel(): ODataModel | null {
        return this._oComponent.getModel(Constants.MODELS.CART_SERVICE) as ODataModel | null;
    }

    private _getCatalogModel(): ODataModel | null {
        return this._oComponent.getModel() as ODataModel | null;
    }

    public getItems(): CartItem[] {
        return (this._getCartModel()?.getProperty("/items") as CartItem[] | undefined) ?? [];
    }

    // Writes the item list back and keeps count and visibility flags in sync
    public setItems(aItems: CartItem[]): void {
        const oCartModel = this._getCartModel();
        if (!oCartModel) {return;}
        oCartModel.setProperty("/items", aItems);
        oCartModel.setProperty("/count", CartService.calcTotals({ items: aItems }).itemCount);
        CartService.updateVisibility(oCartModel);
        oCartModel.refresh(true);
    }

    // -- Static utilities (no component state) -- //

    public static updateVisibility(oCartModel: JSONModel): void {
        const bLoading = oCartModel.getProperty("/loading") as boolean;
        const nCount = oCartModel.getProperty("/count") as number;
        oCartModel.setProperty("/showEmpty", !bLoading && nCount === 0);
        oCartModel.setProperty("/showItems", !bLoading && nCount > 0);
    }

    // Safe float conversion (OData V2 delivers Edm.Decimal as string)
    public static toNum(v: unknown): number {
        const n = parseFloat(asText(v));
        return isNaN(n) ? 0 : n;
    }

    // Identifies the same product across both key spaces: backend positions are keyed by
    // ShoppingCartItemUuid, optimistic rows by CatalogItemUuid, so only Material can match them.
    public static matchKey(oItem: { material?: string; uuid?: string }): string {
        const sMaterial = (oItem.material ?? "").trim().toUpperCase().replace(/^0+/, "");
        return sMaterial || (oItem.uuid ?? "");
    }

    // Maps backend positions; each position carries exactly one unit
    public static mapRawItems(aRaw: Array<Record<string, unknown>>): CartItem[] {
        return aRaw.map((r) => {
            const sCartItemUuid = asText(r.ShoppingCartItemUuid);
            return {
                uuid: sCartItemUuid,
                cartItemUuids: sCartItemUuid ? [sCartItemUuid] : [],
                pending: false,
                name: asText(r.ProductName),
                material: asText(r.Material),
                price: CartService.toNum(r.NetPriceAmount),
                currency: asText(r.TransactionCurrency) || "EUR",
                pictureUrl: asText(r.ProductPictureUrl),
                quantity: Math.max(1, Math.round(CartService.toNum(r.Quantity)))
            };
        });
    }

    // Groups the backend positions of the same material into one row
    public static groupItems(aPositions: CartItem[]): CartItem[] {
        const mRows = new Map<string, CartItem>();
        for (const oPos of aPositions) {
            const sKey = CartService.matchKey(oPos);
            const oRow = mRows.get(sKey);
            if (!oRow) {
                mRows.set(sKey, { ...oPos, cartItemUuids: [...oPos.cartItemUuids] });
                continue;
            }
            oRow.cartItemUuids.push(...oPos.cartItemUuids);
            oRow.quantity += oPos.quantity;
            oRow.name = oRow.name || oPos.name;
            oRow.pictureUrl = oRow.pictureUrl || oPos.pictureUrl;
            if (oRow.price <= 0 && oPos.price > 0) {
                oRow.price = oPos.price;
                oRow.currency = oPos.currency;
            }
        }
        return [...mRows.values()];
    }

    // Merges the grouped backend cart into the local one. The backend owns quantity and position
    // UUIDs; the local row only contributes catalog data the backend does not deliver.
    public static mergeItems(aBackend: CartItem[], aLocal: CartItem[]): CartItem[] {
        const mLocal = new Map<string, CartItem>();
        for (const oLocal of aLocal) {
            mLocal.set(CartService.matchKey(oLocal), oLocal);
        }

        const aMerged = aBackend.map((oBackend) => {
            const sKey = CartService.matchKey(oBackend);
            const oLocal = mLocal.get(sKey);
            mLocal.delete(sKey);
            if (!oLocal) {return oBackend;}

            const bBackendPriced = oBackend.price > 0;
            return {
                ...oBackend,
                // Keep the catalog UUID so product navigation and "add another unit" still work
                uuid: oLocal.catalogUuid || oLocal.uuid || oBackend.uuid,
                catalogUuid: oLocal.catalogUuid ?? oBackend.catalogUuid,
                name: oBackend.name || oLocal.name,
                pictureUrl: oBackend.pictureUrl || oLocal.pictureUrl,
                price: bBackendPriced ? oBackend.price : oLocal.price,
                currency: bBackendPriced ? oBackend.currency : oLocal.currency
            };
        });

        // Only rows with an add still in flight survive without a backend counterpart;
        // anything else the backend no longer returns has really been removed.
        for (const oLocal of mLocal.values()) {
            if (oLocal.pending) {
                aMerged.push({ ...oLocal, cartItemUuids: [] });
            }
        }
        return aMerged;
    }

    // Aggregates a cart state; the backend cart header wins over the summed item prices
    public static calcTotals(oCart: CartState | null | undefined): CartTotals {
        const aItems = oCart?.items ?? [];
        const units = (aList: CartItem[]): number => aList.reduce((s, i) => s + Math.max(1, i.quantity ?? 1), 0);
        const aPriced = aItems.filter((i) => CartService.toNum(i.price) > 0);
        const aUnpriced = aItems.filter((i) => CartService.toNum(i.price) <= 0);

        const nBackendAmount = CartService.toNum(oCart?.totalAmount);
        const bFromBackend = nBackendAmount > 0;

        return {
            positionCount: aItems.length,
            itemCount: units(aItems),
            pricedCount: units(aPriced),
            unpricedCount: units(aUnpriced),
            amount: bFromBackend
                ? nBackendAmount
                : aPriced.reduce((s, i) => s + CartService.toNum(i.price) * Math.max(1, i.quantity ?? 1), 0),
            currency: (bFromBackend ? oCart?.totalCurrency : aPriced[0]?.currency) || "EUR",
            fromBackend: bFromBackend
        };
    }

    // -- Cart header (checkout fields) -- //

    // The header fields in the order the form shows them
    public static headerFieldNames(): HeaderField[] {
        return Object.keys(CartService.HEADER_RULES) as HeaderField[];
    }

    // Brings the entered values into the shape the backend accepts, field by field per rule
    public static trimHeaderFields(oFields: Partial<CartHeaderFields> | null | undefined): CartHeaderFields {
        const oResult = {} as CartHeaderFields;
        for (const sKey of CartService.headerFieldNames()) {
            oResult[sKey] = normalizeText(oFields?.[sKey], CartService.HEADER_RULES[sKey]);
        }
        return oResult;
    }

    // Names every field that keeps the order from going out, with the i18n key saying why. A
    // deviating address is only accepted complete: the backend takes the four parts as one address
    // and a half one would silently ship to the wrong place.
    public static validateHeader(
        oFields: Partial<CartHeaderFields> | null | undefined,
        bDeviatingAddress: boolean
    ): Partial<Record<HeaderField, string>> {
        const oTrimmed = CartService.trimHeaderFields(oFields);
        const oErrors: Partial<Record<HeaderField, string>> = {};
        for (const sKey of CartService.headerFieldNames()) {
            const bAddressField = CartService.DELIVERY_FIELDS.includes(sKey);
            // An address the user does not want is not checked and is not sent either
            if (bAddressField && !bDeviatingAddress) {continue;}
            const sMessage = checkText(oTrimmed[sKey], CartService.HEADER_RULES[sKey], bAddressField);
            if (sMessage) {oErrors[sKey] = sMessage;}
        }
        return oErrors;
    }

    // Drops the delivery address so an unchecked "deviating address" clears what was typed before
    public static clearDelivery(oFields: CartHeaderFields): CartHeaderFields {
        const oCleared = { ...oFields };
        for (const sKey of CartService.DELIVERY_FIELDS) {
            oCleared[sKey] = "";
        }
        return oCleared;
    }

    // Writes the header fields onto the open cart. Verified 2026-09-01: MERGE on an open cart
    // answers 204 and the values survive orderShoppingCart; on an already ordered cart it answers
    // 422 (RAP_RUNTIME/025), so this has to run before the order.
    public saveHeader(sCartUuid: string, oFields: Partial<CartHeaderFields>): Promise<void> {
        const oCartODataModel = this._getCartODataModel();
        if (!oCartODataModel || !sCartUuid) {
            return Promise.reject(new Error("saveHeader: no cart service model or cart UUID"));
        }

        this._setBusy(true);
        return updateOnce(
            oCartODataModel,
            `${Constants.ODATA.ENTITY_CART}(guid'${sCartUuid}')`,
            CartService.trimHeaderFields(oFields)
        ).then(
            () => { this._setBusy(false); },
            (oErr: unknown) => {
                this._setBusy(false);
                Log.error("Cart header update failed", errText(oErr));
                throw oErr;
            }
        );
    }

    // Places the open cart. The header fields have to be written before this runs.
    public order(sCartUuid: string): Promise<void> {
        const oCartODataModel = this._getCartODataModel();
        if (!oCartODataModel || !sCartUuid) {
            return Promise.reject(new Error("order: no cart service model or cart UUID"));
        }
        return callOnce(oCartODataModel, Constants.ODATA.FUNCTION_ORDER_CART, { ShoppingCartUuid: sCartUuid });
    }

    // -- Cart operations -- //

    // Disables the cart controls while a write runs, so a second click cannot fire mid-flight
    private _setBusy(bBusy: boolean): void {
        CartService._busyCount = Math.max(0, CartService._busyCount + (bBusy ? 1 : -1));
        this._getCartModel()?.setProperty("/busy", CartService._busyCount > 0);
    }

    // Units per add; one backend call each, so the number stays bounded
    public static units(nQuantity: number): number {
        return Math.min(Constants.UI.STEP_INPUT_MAX, Math.max(1, Math.round(nQuantity)));
    }

    // Sends the units of one product, one call per unit because the backend stores one unit per
    // position. Busy state and sync are left to the caller: reorder walks many products and must
    // not sync in between.
    private _addUnits(oProduct: CatalogProduct, nUnits: number, fnProgress?: (nDone: number, nTotal: number) => void): Promise<void> {
        const oCatalogModel = this._getCatalogModel();
        if (!oCatalogModel || !oProduct.CatalogItemUuid) {
            return Promise.reject(new Error("addToCart: catalog model or CatalogItemUuid missing"));
        }

        this._addOptimistic(oProduct, nUnits);

        let pChain = Promise.resolve();
        for (let i = 0; i < nUnits; i++) {
            pChain = pChain
                .then(() => callOnce(oCatalogModel, Constants.ODATA.FUNCTION_ADD_TO_CART, {
                    CatalogItemUuid: oProduct.CatalogItemUuid
                }))
                .then(() => { fnProgress?.(i + 1, nUnits); });
        }
        return pChain;
    }

    // Adds units of a product and brings the cart model back in line with the backend.
    // Rejects with the first backend error.
    public addToCart(oProduct: CatalogProduct, nQuantity = 1, fnProgress?: (nDone: number, nTotal: number) => void): Promise<void> {
        const nUnits = CartService.units(nQuantity);
        this._setBusy(true);

        // Busy is held until the sync is through: until then the model still shows the old state,
        // and a second click would act on positions that no longer exist.
        return this._addUnits(oProduct, nUnits, fnProgress).then(
            () => this.sync().then(() => { this._setBusy(false); }),
            (oErr: unknown) => this.sync().then(() => {
                this._setBusy(false);
                throw oErr;
            })
        );
    }

    // Adds further units of an existing cart row
    public addUnit(oItem: CartItem, nUnits = 1): Promise<void> {
        return this.resolveCatalogUuid(oItem).then((sCatalogUuid) => this.addToCart({
            CatalogItemUuid: sCatalogUuid,
            ProductName: oItem.name,
            Material: oItem.material,
            NetPriceAmount: oItem.price,
            TransactionCurrency: oItem.currency,
            ProductPictureUrl: oItem.pictureUrl
        }, nUnits));
    }

    // Sets a row to an absolute quantity by adding or removing the difference; 0 removes the row
    public setQuantity(oItem: CartItem, nQuantity: number): Promise<void> {
        const nTarget = Math.max(0, Math.min(Constants.UI.STEP_INPUT_MAX, Math.round(nQuantity)));
        const oRow = this.getItems().find((i) => i.uuid === oItem.uuid) ?? oItem;
        const nDelta = nTarget - oRow.quantity;

        if (nDelta === 0) {return Promise.resolve();}
        return nDelta > 0 ? this.addUnit(oRow, nDelta) : this.removeUnits(oRow, -nDelta);
    }

    // Removes units of a row, newest position first; without nUnits the whole row goes.
    // Rejects with the first backend error, sync() restores what is really in the cart.
    public removeUnits(oItem: CartItem, nUnits?: number): Promise<void> {
        const oCartODataModel = this._getCartODataModel();
        // The event handler may hand over a row object from before the last sync, so the current
        // one is looked up again; only its UUIDs are guaranteed to still exist in the backend.
        const oRow = this.getItems().find((i) => i.uuid === oItem.uuid) ?? oItem;
        const aUuids = oRow.cartItemUuids ?? [];
        const nRequested = Math.max(1, nUnits ?? Math.max(1, oRow.quantity));
        const aTargets = aUuids.slice(Math.max(0, aUuids.length - nRequested));

        this._removeOptimistic(oRow, nRequested);

        if (!oCartODataModel || !aTargets.length) {
            // Nothing the backend knows about; the optimistic removal is all there is to do
            if (!aTargets.length) {Log.warning("Cart row removed in the frontend only (no position UUID).");}
            return Promise.resolve();
        }

        this._setBusy(true);
        return Promise.allSettled(
            aTargets.map((sUuid) => removeOnce(oCartODataModel, `${Constants.ODATA.ENTITY_CART_ITEM}(guid'${sUuid}')`))
        ).then((aResults) => this.sync().then(() => {
            this._setBusy(false);
            const oFailed = aResults.find((r) => r.status === "rejected");
            if (oFailed) {throw oFailed.reason;}
        }));
    }

    // Shows the new units immediately; sync() replaces them with the backend state. Rows are
    // replaced, never mutated in place - a caller holding a row must not see it change.
    private _addOptimistic(oProduct: CatalogProduct, nUnits: number): void {
        const aItems = [...this.getItems()];
        const sKey = CartService.matchKey({ material: oProduct.Material, uuid: oProduct.CatalogItemUuid });
        const nExisting = aItems.findIndex((i) => CartService.matchKey(i) === sKey);

        if (nExisting >= 0) {
            const oExisting = aItems[nExisting];
            aItems[nExisting] = {
                ...oExisting,
                quantity: oExisting.quantity + nUnits,
                pending: true,
                catalogUuid: oExisting.catalogUuid || oProduct.CatalogItemUuid
            };
        } else {
            aItems.push({
                uuid: oProduct.CatalogItemUuid,
                catalogUuid: oProduct.CatalogItemUuid,
                cartItemUuids: [],
                pending: true,
                name: oProduct.ProductName,
                material: oProduct.Material,
                price: CartService.toNum(oProduct.NetPriceAmount),
                currency: oProduct.TransactionCurrency || "EUR",
                pictureUrl: oProduct.ProductPictureUrl,
                quantity: nUnits
            });
        }
        this.setItems(aItems);
    }

    private _removeOptimistic(oItem: CartItem, nUnits: number): void {
        const aItems = [...this.getItems()];
        const nIndex = aItems.findIndex((i) => i.uuid === oItem.uuid);
        if (nIndex < 0) {return;}

        const oRow = aItems[nIndex];
        const nRest = oRow.quantity - nUnits;
        if (nRest > 0) {
            aItems[nIndex] = {
                ...oRow,
                quantity: nRest,
                cartItemUuids: oRow.cartItemUuids.slice(0, Math.max(0, oRow.cartItemUuids.length - nUnits))
            };
        } else {
            aItems.splice(nIndex, 1);
        }
        this.setItems(aItems);
    }

    // Looks the CatalogItemUuid up by material when the row does not carry it yet: ShoppingCartItem
    // has no CatalogItemUuid at all, so reorder and product navigation from the order history both
    // go through here. Rejects when the material is no longer in the catalog, so callers can say so
    // instead of quietly doing nothing.
    public resolveCatalogUuid(oItem: MaterialRef): Promise<string> {
        if (oItem.catalogUuid) {return Promise.resolve(oItem.catalogUuid);}

        const oCatalogModel = this._getCatalogModel();
        if (!oCatalogModel || !oItem.material) {
            return Promise.reject(new Error("resolveCatalogUuid: no CatalogItemUuid for material " + oItem.material));
        }

        return readList<Record<string, unknown>>(oCatalogModel, Constants.ODATA.ENTITY_CATALOG_ITEM, {
            $filter: CartService.materialFilter([oItem.material]),
            $select: "CatalogItemUuid,Material",
            $top: "1"
        }).then((aRows) => {
            const sUuid = asText(aRows[0]?.CatalogItemUuid);
            if (!sUuid) {throw new Error("resolveCatalogUuid: material not in catalog");}
            return sUuid;
        });
    }

    // Puts the lines of a placed order back into the cart, line by line so one refused article does
    // not take the rest of the order with it. A material the catalog no longer knows is reported by
    // name instead of being skipped silently.
    public reorder(aItems: ReorderItem[], fnProgress?: (nDone: number, nTotal: number) => void): Promise<ReorderResult> {
        const nTotal = aItems.reduce((s, i) => s + CartService.units(i.quantity), 0);

        // Walked one line at a time; nDone travels as an argument so every step reports against the
        // count that was really reached, not against whatever a shared counter holds by then.
        const step = (nIndex: number, oResult: ReorderResult, nDone: number): Promise<ReorderResult> => {
            const oItem = aItems[nIndex];
            if (!oItem) {return Promise.resolve(oResult);}

            const nUnits = CartService.units(oItem.quantity);
            return this.resolveCatalogUuid(oItem)
                // _addUnits, not addToCart: one sync for the whole reorder instead of one per line
                .then((sCatalogUuid) => this._addUnits({
                    CatalogItemUuid: sCatalogUuid,
                    ProductName: oItem.name,
                    Material: oItem.material,
                    NetPriceAmount: oItem.price,
                    TransactionCurrency: oItem.currency,
                    // Not on the order position; sync() and enrichFromCatalog() fill it in
                    ProductPictureUrl: ""
                }, nUnits, (n) => fnProgress?.(nDone + n, nTotal)))
                .then(() => {
                    oResult.added += nUnits;
                }, (oErr: unknown) => {
                    oResult.failed.push(oItem.name || oItem.material);
                    Log.warning(`Reorder failed for material ${oItem.material}`, errText(oErr));
                })
                .then(() => {
                    fnProgress?.(nDone + nUnits, nTotal);
                    return step(nIndex + 1, oResult, nDone + nUnits);
                });
        };

        this._setBusy(true);
        return step(0, { added: 0, failed: [] }, 0)
            .then((oResult) => this.sync().then(() => oResult))
            .then(
                (oResult) => { this._setBusy(false); return oResult; },
                (oErr: unknown) => { this._setBusy(false); throw oErr; }
            );
    }

    // -- Backend sync -- //

    // Re-reads the cart from the backend and merges it into the cart model.
    // A failed read never wipes the local cart.
    public sync(): Promise<void> {
        const oCartODataModel = this._getCartODataModel();
        const oCartModel = this._getCartModel();
        if (!oCartODataModel || !oCartModel) {
            oCartModel?.setProperty("/loading", false);
            return Promise.resolve();
        }

        // Two quick clicks trigger two syncs; the older answer must not overwrite the newer one
        const nSeq = ++CartService._syncSeq;
        const bOutdated = (): boolean => nSeq !== CartService._syncSeq;

        return this._readOpenCart(oCartODataModel)
            .then((oCart) => {
                if (bOutdated()) {return;}
                // Without an open cart, e.g. right after an order, everything still shown belongs
                // to a closed cart and has to go - so the empty cart is written out just like a
                // real one instead of being a second branch.
                const oOpen: OpenCart = oCart ?? {
                    cartUuid: "", totalAmount: 0, totalCurrency: "EUR",
                    fields: CartService.trimHeaderFields(null), items: []
                };
                oCartModel.setProperty("/cartUuid", oOpen.cartUuid);
                oCartModel.setProperty("/totalAmount", oOpen.totalAmount);
                oCartModel.setProperty("/totalCurrency", oOpen.totalCurrency);
                oCartModel.setProperty("/headerFields", oOpen.fields);
                this.setItems(CartService.mergeItems(oOpen.items, this.getItems()));
                this.enrichFromCatalog(this.getItems());
            })
            .catch((oErr: unknown) => {
                Log.warning("Cart sync failed - keeping the local cart.", errText(oErr));
            })
            .then(() => {
                if (bOutdated()) {return;}
                oCartModel.setProperty("/loading", false);
                CartService.updateVisibility(oCartModel);
                oCartModel.refresh(true);
            });
    }

    // $select of the header read with the positions expanded into it
    private static expandedCartSelect(): string {
        const aItemFields = Constants.ODATA.SELECT_CART_ITEM.split(",")
            .map((sField) => `${Constants.ODATA.NAV_CART_ITEMS}/${sField}`);
        return [Constants.ODATA.SELECT_CART_HEADER, ...aItemFields].join(",");
    }

    // The newest still open cart with its positions, or null. Header and positions come in one
    // request because /ShoppingCartItem alone returns every cart the user ever had (verified
    // 2026-09-01: $expand answers 200 with the same fields).
    //
    // The newest cart by date is not enough: right after an order that is the ordered one, and
    // taking it would put the just ordered positions back into the cart. orderShoppingCart_ac
    // cannot be filtered on (400 CX_SADL_GW_FEAT_CTRL_ELEM), so the pick happens on the client.
    private _readOpenCart(oCartODataModel: ODataModel): Promise<OpenCart | null> {
        return readList<RawCartHeader>(oCartODataModel, Constants.ODATA.ENTITY_CART, {
            $top: "5",
            $orderby: "CreationDateTime desc",
            $expand: Constants.ODATA.NAV_CART_ITEMS,
            $select: CartService.expandedCartSelect()
        }).then((aRows) => {
            const oRow = aRows.find((r) => r.orderShoppingCart_ac !== false);
            if (!oRow) {return null;}
            // An expanded collection arrives as { results: [...] }; taking a bare array as well
            // costs nothing and keeps the cart from silently emptying if that ever changes.
            const vItems = oRow.to_ShoppingCartItem;
            const aRaw = Array.isArray(vItems) ? vItems : (vItems?.results ?? []);
            return {
                cartUuid: oRow.ShoppingCartUuid ?? "",
                totalAmount: CartService.toNum(oRow.NetAmount),
                totalCurrency: oRow.CurrencyCode ?? "EUR",
                fields: CartService.trimHeaderFields(oRow),
                items: CartService.groupItems(CartService.mapRawItems(aRaw))
            };
        });
    }

    // OData filter matching a material with and without leading zeros. The only filter string this
    // app assembles itself - everything the user types goes through sap.ui.model.Filter. A single
    // quote is doubled the way OData V2 escapes it, and the padding runs on the raw value so an
    // escaped quote cannot make the padded variant come out the wrong length.
    public static materialFilter(aMaterials: string[]): string {
        const quote = (s: string): string => `Material eq '${s.replace(/'/g, "''")}'`;
        const aParts: string[] = [];
        for (const sMaterial of aMaterials) {
            aParts.push(quote(sMaterial));
            const sPadded = sMaterial.padStart(18, "0");
            if (sPadded !== sMaterial) {
                aParts.push(quote(sPadded));
            }
        }
        return aParts.join(" or ");
    }

    // Fills in what the cart service does not deliver: missing prices (NetPriceAmount=0) and the
    // CatalogItemUuid needed to add another unit
    public enrichFromCatalog(aItems: CartItem[]): void {
        const aMissing = aItems.filter((i) => !i.price || !i.catalogUuid);
        // Asking a second time for a material the catalog already answered on gains nothing: an
        // article without a price in the catalog will not grow one between two syncs.
        const aMaterials = [...new Set(aMissing.map((i) => i.material))]
            .filter((s) => s && !CartService._enrichedMaterials.has(s));
        if (!aMaterials.length) {return;}

        const oCatalogModel = this._getCatalogModel();
        if (!oCatalogModel) {return;}

        readList<Record<string, unknown>>(oCatalogModel, Constants.ODATA.ENTITY_CATALOG_ITEM, {
            $filter: CartService.materialFilter(aMaterials),
            $select: "CatalogItemUuid,Material,NetPriceAmount,TransactionCurrency"
        }).then((aRows) => {
            aMaterials.forEach((s) => CartService._enrichedMaterials.add(s));

            const mCatalog = new Map<string, { uuid: string; price: number; currency: string }>();
            for (const r of aRows) {
                const sMaterial = asText(r.Material);
                if (sMaterial && !mCatalog.has(sMaterial)) {
                    mCatalog.set(sMaterial, {
                        uuid: asText(r.CatalogItemUuid),
                        price: CartService.toNum(r.NetPriceAmount),
                        currency: asText(r.TransactionCurrency) || "EUR"
                    });
                }
            }

            let bChanged = false;
            for (const oItem of aItems) {
                const oHit = mCatalog.get(oItem.material) ?? mCatalog.get(oItem.material.padStart(18, "0"));
                if (!oHit) {continue;}
                if (!oItem.catalogUuid && oHit.uuid) {
                    oItem.catalogUuid = oHit.uuid;
                    bChanged = true;
                }
                if (!oItem.price && oHit.price > 0) {
                    oItem.price = oHit.price;
                    oItem.currency = oHit.currency;
                    bChanged = true;
                }
            }

            if (bChanged) {
                this.setItems(aItems);
            }
        }, (oErr: unknown) => {
            // Not remembered as looked up: the next sync may retry
            Log.warning("enrichFromCatalog failed", errText(oErr));
        });
    }
}
