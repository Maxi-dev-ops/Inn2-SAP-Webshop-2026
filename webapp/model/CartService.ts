import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import UIComponent from "sap/ui/core/UIComponent";

/**
 * Eine Warenkorb-Position in der schlanken Frontend-Struktur,
 * wie sie im "cartModel" (JSONModel) liegt.
 */
export interface CartItem {
    uuid: string;
    cartItemUuid: string;
    name: string;
    material: string;
    price: number;
    currency: string;
    pictureUrl: string;
    quantity: number;
}

/**
 * CartService — kapselt die Warenkorb-Logik, die sonst doppelt in
 * Component.ts und Cart.controller.ts lag:
 *
 *  - mapRawItems():            OData-Rohzeilen → CartItem-Struktur
 *  - preload():                Cart beim App-Start vorladen (Badge sofort korrekt)
 *  - enrichPricesFromCatalog(): fehlende Preise (NetPriceAmount=0) aus dem
 *                              Katalog-Service nach Material-Nummer nachladen
 *
 * Wird mit der UIComponent instanziiert und holt sich die Models selbst:
 *   cartModel   (JSONModel)  – Frontend-Warenkorb
 *   cartService (ODataModel) – ZINN2_UI_MY_SHOP_CART_O2
 *   ""          (ODataModel) – ZINN2_UI_MY_SHOP_CATA_O2 (Katalog, Default-Model)
 */
export default class CartService {
    private readonly _oComponent: UIComponent;

    public constructor(oComponent: UIComponent) {
        this._oComponent = oComponent;
    }

    // -- Model-Zugriff --

    private _getCartModel(): JSONModel | null {
        return this._oComponent.getModel("cartModel") as JSONModel | null;
    }

    private _getCartODataModel(): ODataModel | null {
        return this._oComponent.getModel("cartService") as ODataModel | null;
    }

    private _getCatalogModel(): ODataModel | null {
        return this._oComponent.getModel() as ODataModel | null;
    }

    // -- Mapping --

    /** Sichere String-Konvertierung eines untypisierten OData-Feldwerts. */
    private static toStr(v: unknown): string {
        if (typeof v === "string") {return v;}
        if (typeof v === "number" || typeof v === "boolean") {return String(v);}
        return "";
    }

    /** Sichere Float-Konvertierung (OData V2 liefert Decimals als String). */
    private static toNum(v: unknown): number {
        const n = parseFloat(CartService.toStr(v));
        return isNaN(n) ? 0 : n;
    }

    /** Wandelt OData-Rohzeilen (/ShoppingCartItem) in die Frontend-Struktur um. */
    public static mapRawItems(aRaw: Array<Record<string, unknown>>): CartItem[] {
        return aRaw.map((r) => ({
            uuid: CartService.toStr(r.ShoppingCartItemUuid),
            cartItemUuid: CartService.toStr(r.ShoppingCartItemUuid),
            name: CartService.toStr(r.ProductName),
            material: CartService.toStr(r.Material),
            price: CartService.toNum(r.NetPriceAmount),
            currency: CartService.toStr(r.TransactionCurrency) || "EUR",
            pictureUrl: CartService.toStr(r.ProductPictureUrl),
            quantity: Math.max(1, Math.round(CartService.toNum(r.Quantity)))
        }));
    }

    // -- Preload beim App-Start --

    /**
     * Liest die Warenkorb-Positionen aus dem Cart-Service und füllt das cartModel.
     * Wird beim App-Start (App.controller) aufgerufen, damit das Badge im
     * Shell-Header sofort die korrekte Anzahl zeigt und der erste Cart-Klick
     * ohne Ladewartezeit reagiert.
     */
    public preload(): void {
        const oCartODataModel = this._getCartODataModel();
        const oCartModel = this._getCartModel();
        if (!oCartODataModel || !oCartModel) {return;}

        oCartODataModel.read("/ShoppingCartItem", {
            success: (oData: { results: Array<Record<string, unknown>> }) => {
                const aItems = CartService.mapRawItems(oData.results ?? []);
                oCartModel.setProperty("/items", aItems);
                oCartModel.setProperty("/count", aItems.reduce((s, i) => s + i.quantity, 0));
                oCartModel.setProperty("/loading", false);
                oCartModel.refresh(true);

                this.enrichPricesFromCatalog(aItems);
            },
            error: () => {
                oCartModel.setProperty("/loading", false);
            }
        });
    }

    // -- Preis-Anreicherung aus dem Katalog --

    /**
     * Wenn Cart-Items NetPriceAmount=0 haben, werden die Preise aus dem
     * Katalog-Service (/CatalogItem) per Material-Nummer nachgeladen und
     * direkt ins cartModel zurückgeschrieben.
     *
     * SAP MATNR ist CHAR18 — der Cart-Service liefert u.U. kurze Nummern ("2"),
     * der Katalog speichert sie zero-padded ("000000000000000002"). Beide Formen
     * werden gefiltert und gematcht.
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
            aFilterParts.push(`Material eq '${m}'`);
            const sPadded = m.padStart(18, "0");
            if (sPadded !== m) {
                aFilterParts.push(`Material eq '${sPadded}'`);
            }
        }

        oCatalogModel.read("/CatalogItem", {
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
            }
        });
    }
}
