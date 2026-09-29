import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import Button from "sap/m/Button";
import formatter from "../model/formatter";
import CartService from "../model/CartService";
import CatalogService from "../model/CatalogService";
import WishlistService, { WishlistItem } from "../model/WishlistService";
import { listsReady } from "../model/userScope";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class WishlistController extends BaseController {
    public readonly formatter = formatter;

    private _cartService: CartService | undefined;

    // -- Lifecycle & routing -- //

    public onInit(): void {
        this._cartService = new CartService(this.getOwnerComponent());

        const oWishlistView = new JSONModel({ items: [], count: 0, showEmpty: true, showItems: false });
        this.setModel(oWishlistView, "wishlistView");

        this._attachRoute(Constants.ROUTES.WISHLIST, this._onRouteMatched.bind(this));
    }

    // Reads the stored list into the view model, but only once listsReady() has decided
    private _onRouteMatched(): void {
        void listsReady().then(() => {
            const aItems = WishlistService.getAll();
            this._setItems(aItems);
            void CatalogService.withPrices(this.getOwnerComponent(), aItems)
                .then((aPriced) => { this._setItems(aPriced); });
        });
    }

    private _setItems(aItems: WishlistItem[]): void {
        const oModel = this._json("wishlistView");
        oModel.setProperty("/items", aItems);
        oModel.setProperty("/count", aItems.length);
        oModel.setProperty("/showEmpty", aItems.length === 0);
        oModel.setProperty("/showItems", aItems.length > 0);
        oModel.refresh(true);
    }

    private _row(oEvent: Event): WishlistItem | undefined {
        return this._ctxObject<WishlistItem>(oEvent, "wishlistView");
    }

    // -- Event handlers -- //

    public onProductPress(oEvent: Event): void {
        const oItem = this._row(oEvent);
        if (!oItem) {return;}
        this._navTo(Constants.ROUTES.PRODUCT_DETAIL, { catalogItemUuid: oItem.uuid });
    }

    public onNavToProducts(): void {
        this._navTo(Constants.ROUTES.PRODUCT_LIST);
    }

    public onRemoveFromWishlist(oEvent: Event): void {
        const oItem = this._row(oEvent);
        if (!oItem) {return;}

        WishlistService.toggle(oItem);
        this._onRouteMatched();
        this._refreshWishlistCount();
        MessageToast.show(this._getText("removedFromWishlist", [oItem.name]));
    }

    public onAddToCartFromWishlist(oEvent: Event<object, Button>): void {
        const oItem = this._row(oEvent);
        if (!oItem || !this._cartService) {return;}

        const oBtn = oEvent.getSource();
        this._addToCart(this._cartService, {
            CatalogItemUuid: oItem.uuid,
            ProductName: oItem.name,
            Material: oItem.material,
            NetPriceAmount: oItem.price,
            TransactionCurrency: oItem.currency,
            ProductPictureUrl: oItem.pictureUrl
        }, 1, (bBusy) => { oBtn.setBusy(bBusy); });
    }
}
