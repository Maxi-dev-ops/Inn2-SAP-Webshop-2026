import BaseController from "./BaseController";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import UIComponent from "sap/ui/core/UIComponent";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import DateFormat from "sap/ui/core/format/DateFormat";
import Log from "sap/base/Log";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import formatter from "../model/formatter";
import CartService, { CartItem } from "../model/CartService";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class CartController extends BaseController {
    public readonly formatter = formatter;

    private _cartODataModel: ODataModel | null = null;
    private _cartService: CartService | undefined;
    private _pendingLoads: number = 0;
    private _routeSeq: number = 0;

    // -- Lifecycle --

    public onInit(): void {
        this._cartODataModel = this.getOwnerComponent().getModel(Constants.MODELS.CART_SERVICE) as ODataModel | null;
        this._cartService = new CartService(this.getOwnerComponent());

        this._attachRoute(Constants.ROUTES.CART, this._onRouteMatched.bind(this));
    }

    // -- Loading (cart items + header) --

    private _onRouteMatched(): void {
        const nSeq = ++this._routeSeq;
        const oModel = this._getCartModel();
        const aItems = oModel.getProperty("/items") as CartItem[];

        if (aItems && aItems.length > 0) {
            this._pendingLoads = 1;
            oModel.setProperty("/loading", false);
            CartService.updateVisibility(oModel);
            this._loadCartHeader(nSeq);
            return;
        }

        this._pendingLoads = 2;
        oModel.setProperty("/loading", true);
        CartService.updateVisibility(oModel);
        this._loadCartFromService(nSeq);
        this._loadCartHeader(nSeq);
    }

    private _loadDone(): void {
        this._pendingLoads = Math.max(0, this._pendingLoads - 1);
        if (this._pendingLoads === 0) {
            const oModel = this._getCartModel();
            oModel.setProperty("/loading", false);
            CartService.updateVisibility(oModel);
            oModel.refresh(true);
        }
    }

    private _loadCartFromService(nSeq: number): void {
        if (!this._cartODataModel) {
            this._loadDone();
            return;
        }

        this._cartODataModel.read(Constants.ODATA.ENTITY_CART_ITEM, {
            urlParameters: { $select: Constants.ODATA.SELECT_CART_ITEM },
            success: (oData: { results: Array<Record<string, unknown>> }) => {
                if (nSeq !== this._routeSeq) { return; }
                const aItems = CartService.mapRawItems(oData.results ?? []);
                this._syncToCartModel(aItems);
                this._cartService?.enrichPricesFromCatalog(aItems);
                this._loadDone();
            },
            error: (oErr: unknown) => {
                if (nSeq !== this._routeSeq) { return; }
                Log.warning("Cart ShoppingCartItem read failed.", this._errText(oErr));
                this._loadDone();
            }
        });
    }

    private _loadCartHeader(nSeq: number): void {
        if (!this._cartODataModel) {
            this._loadDone();
            return;
        }

        this._cartODataModel.read(Constants.ODATA.ENTITY_CART, {
            urlParameters: {
                $top: "1",
                $orderby: "CreationDateTime desc",
                $select: Constants.ODATA.SELECT_CART_HEADER
            },
            success: (oData: { results?: Array<{ ShoppingCartUuid?: string; NetAmount?: string; CurrencyCode?: string }> }) => {
                if (nSeq !== this._routeSeq) { return; }
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
                if (nSeq !== this._routeSeq) { return; }
                this._loadDone();
            }
        });
    }

    private _syncToCartModel(aItems: CartItem[]): void {
        const oModel = this._getCartModel();
        oModel.setProperty("/items", aItems);
        oModel.setProperty("/count", aItems.reduce((s, i) => s + i.quantity, 0));
        CartService.updateVisibility(oModel);
        oModel.refresh(true);
    }

    // -- Cart model helpers --

    private _getCartModel(): JSONModel {
        return this.getOwnerComponent().getModel(Constants.MODELS.CART) as JSONModel;
    }

    private _getItems(): CartItem[] {
        return this._getCartModel().getProperty("/items") as CartItem[];
    }

    private _saveItems(aItems: CartItem[]): void {
        const oModel = this._getCartModel();
        oModel.setProperty("/items", aItems);
        oModel.setProperty("/count", aItems.reduce((s, i) => s + i.quantity, 0));
        CartService.updateVisibility(oModel);
        oModel.refresh(true);
    }

    private _getItemFromEvent(oEvent: Event<object, Control>): CartItem | undefined {
        const oCtx = oEvent.getSource().getBindingContext("cartModel");
        return oCtx ? (oCtx.getObject() as CartItem) : undefined;
    }

    // -- Quantity & removal --

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
            this._cartODataModel.remove(`${Constants.ODATA.ENTITY_CART_ITEM}(guid'${oItem.cartItemUuid}')`, {
                error: (oErr: unknown) => {
                    Log.warning("Cart item DELETE failed", this._errText(oErr));
                    const aRollback = this._getItems();
                    aRollback.unshift(oItem);
                    this._saveItems(aRollback);
                    MessageBox.error(this._extractODataError(oErr, this._getText("removeItemError")));
                }
            });
        }
    }

    // -- Checkout --

    public onOrder(): void {
        const oCartModel = this._getCartModel();
        const sCartUuid = String(oCartModel.getProperty("/cartUuid") ?? "");

        if (!this._cartODataModel || !sCartUuid) {
            MessageToast.show(this._getText("orderNoCart"));
            return;
        }

        oCartModel.setProperty("/loading", true);
        CartService.updateVisibility(oCartModel);

        this._cartODataModel.callFunction(Constants.ODATA.FUNCTION_ORDER_CART, {
            method: "POST",
            urlParameters: { ShoppingCartUuid: sCartUuid },
            success: () => {
                oCartModel.setProperty("/loading", false);
                MessageToast.show(this._getText("orderSubmitted"));

                const aItems = this._getItems();
                const nItemCount = Number(oCartModel.getProperty("/count") ?? 0);
                const nTotal = aItems.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
                const sCurrency = aItems.find((i) => i.price > 0)?.currency
                    ?? String(oCartModel.getProperty("/totalCurrency") ?? "EUR");

                const oOrderConfirm = this.getOwnerComponent().getModel(Constants.MODELS.ORDER_CONFIRM) as JSONModel;
                oOrderConfirm.setProperty("/orderUuid", sCartUuid);
                oOrderConfirm.setProperty("/submittedAt", DateFormat.getDateTimeInstance({ style: "medium" }).format(new Date()));
                oOrderConfirm.setProperty("/itemCount", nItemCount);
                oOrderConfirm.setProperty("/totalAmount", nTotal);
                oOrderConfirm.setProperty("/totalCurrency", sCurrency);

                this._saveItems([]);
                oCartModel.setProperty("/totalAmount", 0);
                oCartModel.setProperty("/cartUuid", "");

                UIComponent.getRouterFor(this).navTo(Constants.ROUTES.ORDER_CONFIRM);
            },
            error: (oErr: unknown) => {
                oCartModel.setProperty("/loading", false);
                CartService.updateVisibility(oCartModel);
                Log.error("orderShoppingCart error", this._errText(oErr));
                MessageBox.error(this._extractODataError(oErr, this._getText("orderError")), {
                    title: this._getText("orderError")
                });
            }
        });
    }

    public onContinueShopping(): void {
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PRODUCT_LIST);
    }

    // -- Formatters --

    public formatCartItemsTitle(nCount: number): string {
        return this._getText(nCount === 1 ? "cartItemsInCartOne" : "cartItemsInCart", [nCount]);
    }
}
