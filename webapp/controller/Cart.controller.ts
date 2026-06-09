import Controller from "sap/ui/core/mvc/Controller";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import UIComponent from "sap/ui/core/UIComponent";
import MessageToast from "sap/m/MessageToast";
import Log from "sap/base/Log";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import formatter from "../model/formatter";
import CartService, { CartItem } from "../model/CartService";

/**
 * Cart-Controller
 *
 * Liest Warenkorb-Positionen aus ZINN2_UI_MY_SHOP_CART_O2.
 * Da ShoppingCartItem.NetPriceAmount im Backend oft 0 ist,
 * werden die Preise nachträglich aus dem Katalog-Service angereichert
 * (gemeinsame Logik in model/CartService.ts).
 */

export default class CartController extends Controller {
    public readonly formatter = formatter;

    private _cartODataModel: ODataModel | null = null;
    private _cartService!: CartService;
    private _pendingLoads: number = 0;

    // -- Lifecycle --

    public onInit(): void {
        // cartModel wird im Root-View-Controller (App.controller) angelegt & vorgeladen
        this._cartODataModel = this.getOwnerComponent().getModel("cartService") as ODataModel | null;
        this._cartService = new CartService(this.getOwnerComponent() as UIComponent);

        UIComponent.getRouterFor(this)
            .getRoute("RouteCart")
            .attachPatternMatched(this._onRouteMatched.bind(this));
    }

    private _onRouteMatched(): void {
        const oModel = this._getCartModel();
        const aItems = oModel.getProperty("/items") as CartItem[];

        // Bereits vorgeladen (aus Component): nur den Header aktualisieren
        if (aItems && aItems.length > 0) {
            this._pendingLoads = 1;
            oModel.setProperty("/loading", false);
            this._loadCartHeader();
            return;
        }

        // Erstes Laden oder leerer Warenkorb: aus dem Backend laden
        this._pendingLoads = 2;
        oModel.setProperty("/loading", true);

        this._loadCartFromService();
        this._loadCartHeader();
    }

    private _loadDone(): void {
        this._pendingLoads = Math.max(0, this._pendingLoads - 1);
        if (this._pendingLoads === 0) {
            this._getCartModel().setProperty("/loading", false);
        }
    }

    // -- Cart-Service lesen --

    private _loadCartFromService(): void {
        if (!this._cartODataModel) {
            this._loadDone();
            return;
        }

        this._cartODataModel.read("/ShoppingCartItem", {
            success: (oData: { results: Array<Record<string, unknown>> }) => {
                const aItems = CartService.mapRawItems(oData.results ?? []);
                this._syncToCartModel(aItems);
                // Preise aus dem Katalog nachladen, wenn der Cart-Service keine liefert
                this._cartService.enrichPricesFromCatalog(aItems);
                this._loadDone();
            },
            error: (oErr: unknown) => {
                Log.warning("Cart ShoppingCartItem read failed.", (oErr as { responseText?: string })?.responseText ?? "");
                this._loadDone();
            }
        });
    }

    private _loadCartHeader(): void {
        if (!this._cartODataModel) {
            this._loadDone();
            return;
        }

        this._cartODataModel.read("/ShoppingCart", {
            urlParameters: {
                $top: "1",
                $orderby: "CreationDateTime desc",
                $select: "ShoppingCartUuid,NetAmount,CurrencyCode"
            },
            success: (oData: { results?: Array<{ ShoppingCartUuid?: string; NetAmount?: string; CurrencyCode?: string }> }) => {
                const oHeader = oData.results?.[0];
                if (oHeader) {
                    const oModel = this._getCartModel();
                    oModel.setProperty("/cartUuid", oHeader.ShoppingCartUuid ?? "");
                    oModel.setProperty("/totalAmount", parseFloat(oHeader.NetAmount ?? "0"));
                    oModel.setProperty("/totalCurrency", oHeader.CurrencyCode ?? "EUR");
                }
                this._loadDone();
            },
            error: () => {
                this._loadDone();
            }
        });
    }

    // -- Model-Sync --

    private _syncToCartModel(aItems: CartItem[]): void {
        const oModel = this._getCartModel();
        oModel.setProperty("/items", aItems);
        oModel.setProperty("/count", aItems.reduce((s, i) => s + i.quantity, 0));
        // Alle Bindings (inkl. Root-Pfad-Formatter im Summary-Panel) neu auswerten
        oModel.refresh(true);
    }

    private _getCartModel(): JSONModel {
        return this.getOwnerComponent().getModel("cartModel") as JSONModel;
    }

    /** Liest einen Text aus dem i18n-ResourceBundle, optional mit Platzhaltern {0}, {1}, … */
    private _getText(sKey: string, aArgs?: (string | number)[]): string {
        const oBundle = (this.getOwnerComponent().getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
        return oBundle.getText(sKey, aArgs);
    }

    private _getItems(): CartItem[] {
        return this._getCartModel().getProperty("/items") as CartItem[];
    }

    private _saveItems(aItems: CartItem[]): void {
        const oModel = this._getCartModel();
        oModel.setProperty("/items", aItems);
        oModel.setProperty("/count", aItems.reduce((s, i) => s + i.quantity, 0));
        oModel.refresh(true);
    }

    private _getItemFromEvent(oEvent: Event): CartItem | undefined {
        const oCtx = (oEvent.getSource() as Control).getBindingContext("cartModel");
        return oCtx ? (oCtx.getObject() as CartItem) : undefined;
    }

    // -- Mengen-Steuerung --

    public onIncreaseQty(oEvent: Event): void {
        const oItem = this._getItemFromEvent(oEvent);
        if (!oItem) {return;}
        const aItems = this._getItems();
        const oFound = aItems.find((i) => i.uuid === oItem.uuid);
        if (oFound) {
            oFound.quantity += 1;
            this._saveItems(aItems);
        }
    }

    public onDecreaseQty(oEvent: Event): void {
        const oItem = this._getItemFromEvent(oEvent);
        if (!oItem) {return;}
        const aItems = this._getItems();
        const oFound = aItems.find((i) => i.uuid === oItem.uuid);
        if (oFound) {
            if (oFound.quantity <= 1) {
                this._removeItem(oFound);
            } else {
                oFound.quantity -= 1;
                this._saveItems(aItems);
            }
        }
    }

    public onRemoveItem(oEvent: Event): void {
        const oItem = this._getItemFromEvent(oEvent);
        if (!oItem) {return;}
        this._removeItem(oItem);
        MessageToast.show(this._getText("itemRemoved", [oItem.name]));
    }

    private _removeItem(oItem: CartItem): void {
        const aItems = this._getItems().filter((i) => i.uuid !== oItem.uuid);
        this._saveItems(aItems);

        if (this._cartODataModel && oItem.cartItemUuid) {
            this._cartODataModel.remove(`/ShoppingCartItem(guid'${oItem.cartItemUuid}')`, {
                error: (oErr: unknown) => {
                    Log.warning("Cart item DELETE failed", (oErr as { responseText?: string })?.responseText ?? "");
                }
            });
        }
    }

    // -- Bestellen --

    public onOrder(): void {
        const oCartModel = this._getCartModel();
        const sCartUuid = String(oCartModel.getProperty("/cartUuid") ?? "");

        // Ohne Warenkorb-UUID (z.B. Header noch nicht geladen) kann das Backend
        // nicht bestellen — defensiver Fallback.
        if (!this._cartODataModel || !sCartUuid) {
            MessageToast.show(this._getText("orderNoCart"));
            return;
        }

        oCartModel.setProperty("/loading", true);

        // Backend-Action aus dem Cart-Service-Vertrag:
        // FunctionImport "orderShoppingCart" (POST, Parameter ShoppingCartUuid).
        this._cartODataModel.callFunction("/orderShoppingCart", {
            method: "POST",
            urlParameters: { ShoppingCartUuid: sCartUuid },
            success: () => {
                oCartModel.setProperty("/loading", false);
                MessageToast.show(this._getText("orderSubmitted"));
                // Frontend-Warenkorb leeren
                this._saveItems([]);
                oCartModel.setProperty("/totalAmount", 0);
                oCartModel.setProperty("/cartUuid", "");
                UIComponent.getRouterFor(this).navTo("RouteProductList");
            },
            error: (oErr: unknown) => {
                oCartModel.setProperty("/loading", false);
                const sResp = (oErr as { responseText?: string })?.responseText ?? "";
                Log.error("orderShoppingCart error", sResp);
                let sMsg = this._getText("orderError");
                try {
                    const oResp = JSON.parse(sResp) as { error?: { message?: { value?: string } } };
                    sMsg = oResp?.error?.message?.value ?? sMsg;
                } catch {
                    const oMatch = sResp.match(/<message[^>]*>([^<]+)<\/message>/i);
                    if (oMatch?.[1]) {sMsg = oMatch[1];}
                }
                MessageToast.show(sMsg);
            }
        });
    }

    // -- Bilder --

    public onCartImageError(oEvent: Event): void {
        (oEvent.getSource() as Control).addStyleClass("webshopImageBroken");
    }

    // -- Navigation --

    public onNavBack(): void {
        UIComponent.getRouterFor(this).navTo("RouteProductList");
    }

    public onNavHome(): void {
        UIComponent.getRouterFor(this).navTo("RouteHome");
    }

    public onContinueShopping(): void {
        UIComponent.getRouterFor(this).navTo("RouteProductList");
    }
}
