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

// -- Types -- //

// One cart row: the backend stores one unit per ShoppingCartItem, so a row groups all positions of a material
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
    // Contract the backend priced this position from; explains a price the catalog does not have
    salesContract?: string;
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

// Writable header fields of the open cart: reference, remark and a deviating delivery address
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
    // Action control: true while the cart is open, false once it is ordered
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
    // maxLength mirrors the metadata (longer values get a 400); the checks are ours, the backend stores anything
    public static readonly HEADER_RULES: Readonly<Record<HeaderField, FieldRule>> = {
        ExternalReference: { maxLength: 35, check: hasAlphanumeric, messageKey: "validationReference" },
        Remark: { maxLength: 256 },
        DeliveryStreet: { maxLength: 60, check: hasLetter, messageKey: "validationStreet" },
        DeliveryCity: { maxLength: 40, check: hasLetter, messageKey: "validationCity" },
        DeliveryPostalCode: { maxLength: 10, upperCase: true, check: isPostalCode, messageKey: "validationPostalCode" },
        DeliveryCountry: { maxLength: 3, upperCase: true, check: isKnownCountry, messageKey: "validationCountry" }
    };

    // The deviating delivery address, only valid as a whole
    private static readonly DELIVERY_FIELDS: HeaderField[] =
        ["DeliveryStreet", "DeliveryPostalCode", "DeliveryCity", "DeliveryCountry"];

    // Materials enrichFromCatalog already looked up; a catalog answer does not change between syncs
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
    public static toNumber(v: unknown): number {
        const n = parseFloat(asText(v));
        return isNaN(n) ? 0 : n;
    }

    // Positions are keyed by ShoppingCartItemUuid, optimistic rows by CatalogItemUuid; only Material matches both
    public static productMatchKey(oItem: { material?: string; uuid?: string }): string {
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
                price: CartService.toNumber(r.NetPriceAmount),
                currency: asText(r.TransactionCurrency) || "EUR",
                pictureUrl: asText(r.ProductPictureUrl),
                quantity: Math.max(1, Math.round(CartService.toNumber(r.Quantity))),
                salesContract: asText(r.SalesContract)
            };
        });
    }

    // Groups the backend positions of the same material into one row
    public static groupItems(aPositions: CartItem[]): CartItem[] {
        const mRows = new Map<string, CartItem>();
        for (const oPos of aPositions) {
            const sKey = CartService.productMatchKey(oPos);
            const oRow = mRows.get(sKey);
            if (!oRow) {
                mRows.set(sKey, { ...oPos, cartItemUuids: [...oPos.cartItemUuids] });
                continue;
            }
            oRow.cartItemUuids.push(...oPos.cartItemUuids);
            oRow.quantity += oPos.quantity;
            oRow.name = oRow.name || oPos.name;
            oRow.pictureUrl = oRow.pictureUrl || oPos.pictureUrl;
            oRow.salesContract = oRow.salesContract || oPos.salesContract;
            if (oRow.price <= 0 && oPos.price > 0) {
                oRow.price = oPos.price;
                oRow.currency = oPos.currency;
            }
        }
        return [...mRows.values()];
    }

    // Merges the backend cart into the local one; the backend owns quantity and position UUIDs
    public static mergeItems(aBackend: CartItem[], aLocal: CartItem[]): CartItem[] {
        const mLocal = new Map<string, CartItem>();
        for (const oLocal of aLocal) {
            mLocal.set(CartService.productMatchKey(oLocal), oLocal);
        }

        const aMerged = aBackend.map((oBackend) => {
            const sKey = CartService.productMatchKey(oBackend);
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

        // Rows without a backend counterpart survive only while their add is still in flight
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
        const aPriced = aItems.filter((i) => CartService.toNumber(i.price) > 0);
        const aUnpriced = aItems.filter((i) => CartService.toNumber(i.price) <= 0);

        const nBackendAmount = CartService.toNumber(oCart?.totalAmount);
        const bFromBackend = nBackendAmount > 0;

        return {
            positionCount: aItems.length,
            itemCount: units(aItems),
            pricedCount: units(aPriced),
            unpricedCount: units(aUnpriced),
            amount: bFromBackend
                ? nBackendAmount
                : aPriced.reduce((s, i) => s + CartService.toNumber(i.price) * Math.max(1, i.quantity ?? 1), 0),
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

    // i18n message key per field that blocks the order; a deviating address must be complete
    public static validateHeader(
        oFields: Partial<CartHeaderFields> | null | undefined,
        bDeviatingAddress: boolean
    ): Partial<Record<HeaderField, string>> {
        const oTrimmed = CartService.trimHeaderFields(oFields);
        const oErrors: Partial<Record<HeaderField, string>> = {};
        for (const sKey of CartService.headerFieldNames()) {
            const bAddressField = CartService.DELIVERY_FIELDS.includes(sKey);
            // No deviating address wanted: nothing to check
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

    // Writes the header fields onto the open cart; must run before placeOrder(), an ordered cart answers 422
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

    // Places the open cart; saveHeader() has to run first
    public placeOrder(sCartUuid: string): Promise<void> {
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
    public static clampUnits(nQuantity: number): number {
        return Math.min(Constants.UI.STEP_INPUT_MAX, Math.max(1, Math.round(nQuantity)));
    }

    // One backend call per unit; busy state and sync are left to the caller so reorder syncs only once
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

    // Adds units of a product and syncs; rejects with the first backend error
    public addToCart(oProduct: CatalogProduct, nQuantity = 1, fnProgress?: (nDone: number, nTotal: number) => void): Promise<void> {
        const nUnits = CartService.clampUnits(nQuantity);
        this._setBusy(true);

        // Busy until the sync is through, so a second click cannot act on stale positions
        return this._addUnits(oProduct, nUnits, fnProgress).then(
            () => this.syncFromBackend().then(() => { this._setBusy(false); }),
            (oErr: unknown) => this.syncFromBackend().then(() => {
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

    // Removes units of a row, newest position first, the whole row without nUnits
    public removeUnits(oItem: CartItem, nUnits?: number): Promise<void> {
        const oCartODataModel = this._getCartODataModel();
        // The handler may pass a row from before the last sync; only the current row's UUIDs still exist
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
        ).then((aResults) => this.syncFromBackend().then(() => {
            this._setBusy(false);
            const oFailed = aResults.find((r) => r.status === "rejected");
            if (oFailed) {throw oFailed.reason;}
        }));
    }

    // Shows the new units until syncFromBackend() replaces them; rows are replaced, never mutated in place
    private _addOptimistic(oProduct: CatalogProduct, nUnits: number): void {
        const aItems = [...this.getItems()];
        const sKey = CartService.productMatchKey({ material: oProduct.Material, uuid: oProduct.CatalogItemUuid });
        const nExisting = aItems.findIndex((i) => CartService.productMatchKey(i) === sKey);

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
                price: CartService.toNumber(oProduct.NetPriceAmount),
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

    // ShoppingCartItem has no CatalogItemUuid, so it is looked up by material; rejects if not in the catalog
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

    // Puts an order back into the cart line by line, so one refused article does not stop the rest
    public reorder(aItems: ReorderItem[], fnProgress?: (nDone: number, nTotal: number) => void): Promise<ReorderResult> {
        const nTotal = aItems.reduce((s, i) => s + CartService.clampUnits(i.quantity), 0);

        // nDone is passed along so every step reports progress against the count really reached
        const step = (nIndex: number, oResult: ReorderResult, nDone: number): Promise<ReorderResult> => {
            const oItem = aItems[nIndex];
            if (!oItem) {return Promise.resolve(oResult);}

            const nUnits = CartService.clampUnits(oItem.quantity);
            return this.resolveCatalogUuid(oItem)
                // _addUnits, not addToCart: one sync for the whole reorder instead of one per line
                .then((sCatalogUuid) => this._addUnits({
                    CatalogItemUuid: sCatalogUuid,
                    ProductName: oItem.name,
                    Material: oItem.material,
                    NetPriceAmount: oItem.price,
                    TransactionCurrency: oItem.currency,
                    // Not on the order position; syncFromBackend() and enrichFromCatalog() fill it in
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
            .then((oResult) => this.syncFromBackend().then(() => oResult))
            .then(
                (oResult) => { this._setBusy(false); return oResult; },
                (oErr: unknown) => { this._setBusy(false); throw oErr; }
            );
    }

    // -- Backend sync -- //

    // Re-reads the cart and merges it into the cart model; a failed read keeps the local cart
    public syncFromBackend(): Promise<void> {
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
                // No open cart (e.g. right after an order): write an empty one so nothing of the closed cart stays
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

    // The newest open cart with its positions, or null. Expanded from the header because /ShoppingCartItem
    // returns the items of every cart; the open one is picked here since orderShoppingCart_ac is not filterable.
    private _readOpenCart(oCartODataModel: ODataModel): Promise<OpenCart | null> {
        return readList<RawCartHeader>(oCartODataModel, Constants.ODATA.ENTITY_CART, {
            $top: "5",
            $orderby: "CreationDateTime desc",
            $expand: Constants.ODATA.NAV_CART_ITEMS,
            $select: CartService.expandedCartSelect()
        }).then((aRows) => {
            const oRow = aRows.find((r) => r.orderShoppingCart_ac !== false);
            if (!oRow) {return null;}
            // An expanded collection arrives as { results: [...] }; a bare array is accepted too
            const vItems = oRow.to_ShoppingCartItem;
            const aRaw = Array.isArray(vItems) ? vItems : (vItems?.results ?? []);
            return {
                cartUuid: oRow.ShoppingCartUuid ?? "",
                totalAmount: CartService.toNumber(oRow.NetAmount),
                totalCurrency: oRow.CurrencyCode ?? "EUR",
                fields: CartService.trimHeaderFields(oRow),
                items: CartService.groupItems(CartService.mapRawItems(aRaw))
            };
        });
    }

    // Matches a material with and without leading zeros; quotes are escaped after padding the raw value
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

    // Fills in what the cart service lacks: missing prices and the CatalogItemUuid to add another unit
    public enrichFromCatalog(aItems: CartItem[]): void {
        const aMissing = aItems.filter((i) => !i.price || !i.catalogUuid);
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
                        price: CartService.toNumber(r.NetPriceAmount),
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
