import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import UIComponent from "sap/ui/core/UIComponent";
import Log from "sap/base/Log";
import Constants from "./Constants";

export interface CartItem {
    uuid: string;
    /** Backend key of the cart position; empty for optimistic items until the next backend load. */
    cartItemUuid?: string;
    name: string;
    material: string;
    price: number;
    currency: string;
    pictureUrl: string;
    quantity: number;
}

export interface CatalogProduct {
    CatalogItemUuid: string;
    ProductName: string;
    Material: string;
    NetPriceAmount: number | string;
    TransactionCurrency: string;
    ProductPictureUrl: string;
}

export default class CartService {
    private readonly _oComponent: UIComponent;

    public constructor(oComponent: UIComponent) {
        this._oComponent = oComponent;
    }

    // -- Internal model access --

    private _getCartModel(): JSONModel | null {
        return this._oComponent.getModel(Constants.MODELS.CART) as JSONModel | null;
    }

    private _getCartODataModel(): ODataModel | null {
        return this._oComponent.getModel(Constants.MODELS.CART_SERVICE) as ODataModel | null;
    }

    private _getCatalogModel(): ODataModel | null {
        return this._oComponent.getModel() as ODataModel | null;
    }

    // -- Static utilities (no component state) --

    private static toStr(v: unknown): string {
        if (typeof v === "string") {return v;}
        if (typeof v === "number" || typeof v === "boolean") {return String(v);}
        return "";
    }

    private static errText(oErr: unknown): string {
        return (oErr as { responseText?: string })?.responseText ?? "";
    }

    public static updateVisibility(oCartModel: JSONModel): void {
        const bLoading = oCartModel.getProperty("/loading") as boolean;
        const nCount = oCartModel.getProperty("/count") as number;
        oCartModel.setProperty("/showEmpty", !bLoading && nCount === 0);
        oCartModel.setProperty("/showItems", !bLoading && nCount > 0);
    }

    /** Safe float conversion (OData V2 delivers Edm.Decimal as string). */
    public static toNum(v: unknown): number {
        const n = parseFloat(CartService.toStr(v));
        return isNaN(n) ? 0 : n;
    }

    public static mapRawItems(aRaw: Array<Record<string, unknown>>): CartItem[] {
        return aRaw.map((r) => ({
            uuid: CartService.toStr(r.CatalogItemUuid ?? r.ShoppingCartItemUuid),
            cartItemUuid: CartService.toStr(r.ShoppingCartItemUuid),
            name: CartService.toStr(r.ProductName),
            material: CartService.toStr(r.Material),
            price: CartService.toNum(r.NetPriceAmount),
            currency: CartService.toStr(r.TransactionCurrency) || "EUR",
            pictureUrl: CartService.toStr(r.ProductPictureUrl),
            quantity: Math.max(1, Math.round(CartService.toNum(r.Quantity)))
        }));
    }

    // -- Instance API (reads/writes the component models) --

    /** Adds a product to the frontend cart model (or increases quantity if already present). */
    public addItem(oProduct: CatalogProduct, nQuantity = 1): void {
        const oCartModel = this._getCartModel();
        if (!oCartModel) {return;}

        const nQty = Math.max(1, Math.round(nQuantity));
        const aItems = (oCartModel.getProperty("/items") as CartItem[] | undefined) ?? [];
        const oExisting = aItems.find((i) => i.uuid === oProduct.CatalogItemUuid);
        if (oExisting) {
            oExisting.quantity += nQty;
        } else {
            aItems.push({
                uuid: oProduct.CatalogItemUuid,
                name: oProduct.ProductName,
                material: oProduct.Material,
                price: CartService.toNum(oProduct.NetPriceAmount),
                currency: oProduct.TransactionCurrency || "EUR",
                pictureUrl: oProduct.ProductPictureUrl,
                quantity: nQty
            });
        }
        oCartModel.setProperty("/items", aItems);
        oCartModel.setProperty("/count", aItems.reduce((s, i) => s + i.quantity, 0));
        CartService.updateVisibility(oCartModel);
        oCartModel.refresh(true);
    }

    /** Preloads cart items from the backend so the shell badge is correct on app start. */
    public preload(): void {
        const oCartODataModel = this._getCartODataModel();
        const oCartModel = this._getCartModel();
        if (!oCartODataModel || !oCartModel) {return;}

        oCartODataModel.read(Constants.ODATA.ENTITY_CART_ITEM, {
            urlParameters: { $select: Constants.ODATA.SELECT_CART_ITEM },
            success: (oData: { results: Array<Record<string, unknown>> }) => {
                const aItems = CartService.mapRawItems(oData.results ?? []);
                oCartModel.setProperty("/items", aItems);
                oCartModel.setProperty("/count", aItems.reduce((s, i) => s + i.quantity, 0));
                oCartModel.setProperty("/loading", false);
                oCartModel.refresh(true);

                this.enrichPricesFromCatalog(aItems);
            },
            error: (oErr: unknown) => {
                Log.warning("Cart preload failed.", CartService.errText(oErr));
                oCartModel.setProperty("/loading", false);
                CartService.updateVisibility(oCartModel);
            }
        });
    }

    /**
     * Fills in missing prices (NetPriceAmount=0) from the catalog service.
     */
    public enrichPricesFromCatalog(aItems: CartItem[]): void {
        const aUnpriced = aItems.filter((i) => !i.price || i.price === 0);
        if (!aUnpriced.length) {return;}

        const aMaterials = [...new Set(aUnpriced.map((i) => i.material))].filter(Boolean);
        if (!aMaterials.length) {return;}

        const oCatalogModel = this._getCatalogModel();
        if (!oCatalogModel) {return;}

        const aFilterParts: string[] = [];
        for (const m of aMaterials) {
            const sSafe = m.replace(/'/g, "''");
            aFilterParts.push(`Material eq '${sSafe}'`);
            const sPadded = sSafe.padStart(18, "0");
            if (sPadded !== sSafe) {
                aFilterParts.push(`Material eq '${sPadded}'`);
            }
        }

        oCatalogModel.read(Constants.ODATA.ENTITY_CATALOG_ITEM, {
            urlParameters: {
                $filter: aFilterParts.join(" or "),
                $select: "Material,NetPriceAmount,TransactionCurrency"
            },
            success: (oData: { results: Array<Record<string, unknown>> }) => {
                const mPrices = new Map<string, { price: number; currency: string }>();
                for (const r of oData.results ?? []) {
                    const sMat = CartService.toStr(r.Material);
                    const nPrice = CartService.toNum(r.NetPriceAmount);
                    if (sMat && nPrice > 0 && !mPrices.has(sMat)) {
                        mPrices.set(sMat, { price: nPrice, currency: CartService.toStr(r.TransactionCurrency) || "EUR" });
                    }
                }

                let bChanged = false;
                for (const oItem of aItems) {
                    if (!oItem.price || oItem.price === 0) {
                        const oPrice = mPrices.get(oItem.material) ?? mPrices.get(oItem.material.padStart(18, "0"));
                        if (oPrice) {
                            oItem.price = oPrice.price;
                            oItem.currency = oPrice.currency;
                            bChanged = true;
                        }
                    }
                }

                if (bChanged) {
                    const oCartModel = this._getCartModel();
                    if (oCartModel) {
                        oCartModel.setProperty("/items", aItems);
                        oCartModel.refresh(true);
                    }
                }
            },
            error: (oErr: unknown) => {
                Log.warning("enrichPricesFromCatalog failed", CartService.errText(oErr));
            }
        });
    }
}
