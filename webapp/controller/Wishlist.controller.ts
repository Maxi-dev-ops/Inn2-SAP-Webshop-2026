import BaseController from "./BaseController";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import UIComponent from "sap/ui/core/UIComponent";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Log from "sap/base/Log";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import formatter from "../model/formatter";
import CartService from "../model/CartService";
import WishlistService, { WishlistItem } from "../model/WishlistService";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class WishlistController extends BaseController {
    public readonly formatter = formatter;

    private _cartService: CartService | undefined;

    // -- Lifecycle & routing --

    public onInit(): void {
        this._cartService = new CartService(this.getOwnerComponent());

        const oWishlistView = new JSONModel({ items: [], count: 0, showEmpty: true, showItems: false });
        this.setModel(oWishlistView, "wishlistView");

        this._attachRoute(Constants.ROUTES.WISHLIST, this._onRouteMatched.bind(this));
    }

    private _onRouteMatched(): void {
        const aItems = WishlistService.getAll();
        const oModel = this.getModel("wishlistView") as JSONModel;
        oModel.setProperty("/items", aItems);
        oModel.setProperty("/count", aItems.length);
        oModel.setProperty("/showEmpty", aItems.length === 0);
        oModel.setProperty("/showItems", aItems.length > 0);
    }

    private _getItemFromEvent(oEvent: Event<object, Control>): WishlistItem | undefined {
        const oCtx = oEvent.getSource().getBindingContext("wishlistView");
        return oCtx ? (oCtx.getObject() as WishlistItem) : undefined;
    }

    // -- Event handlers --

    public onProductPress(oEvent: Event): void {
        const oItem = this._getItemFromEvent(oEvent);
        if (!oItem) {return;}
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PRODUCT_DETAIL, {
            catalogItemUuid: oItem.uuid
        });
    }

    public onNavToProducts(): void {
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PRODUCT_LIST);
    }

    public onRemoveFromWishlist(oEvent: Event): void {
        const oItem = this._getItemFromEvent(oEvent);
        if (!oItem) {return;}

        WishlistService.toggle(oItem);
        this._onRouteMatched();
        const oWishlistModel = this.getOwnerComponent().getModel(Constants.MODELS.WISHLIST) as JSONModel;
        oWishlistModel.setProperty("/count", WishlistService.getAll().length);
        oWishlistModel.refresh(true);
        MessageToast.show(this._getText("removedFromWishlist", [oItem.name]));
    }

    public onAddToCartFromWishlist(oEvent: Event<object, Button>): void {
        const oItem = this._getItemFromEvent(oEvent);
        if (!oItem) {return;}

        const oBtn = oEvent.getSource();
        oBtn.setBusy(true);

        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        oModel.callFunction(Constants.ODATA.FUNCTION_ADD_TO_CART, {
            method: "POST",
            urlParameters: { CatalogItemUuid: oItem.uuid },
            success: () => {
                oBtn.setBusy(false);
                this._cartService?.addItem({
                    CatalogItemUuid: oItem.uuid,
                    ProductName: oItem.name,
                    Material: oItem.material,
                    NetPriceAmount: oItem.price,
                    TransactionCurrency: oItem.currency,
                    ProductPictureUrl: oItem.pictureUrl
                });
                const sMsg = this._getText("addedToCart", [oItem.name]);
                MessageToast.show(sMsg);
                this._announceCartUpdate(sMsg);
            },
            error: (oErr: unknown) => {
                oBtn.setBusy(false);
                Log.error("addToShoppingCart error", this._errText(oErr));
                MessageBox.error(this._extractODataError(oErr, this._getText("addToCartError")), {
                    title: this._getText("addToCartError")
                });
            }
        });
    }
}
