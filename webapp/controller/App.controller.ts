import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import CartService from "../model/CartService";
import CatalogService from "../model/CatalogService";
import WishlistService from "../model/WishlistService";
import { listsReady } from "../model/userScope";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class App extends BaseController {

    public onInit(): void {
        const oComponent = this.getOwnerComponent();

        const oCartModel = new JSONModel({
            count: 0,
            items: [],
            totalAmount: 0,
            totalCurrency: "EUR",
            cartUuid: "",
            loading: true,
            busy: false,
            showEmpty: false,
            showItems: false,
            // Writable header fields of the open cart
            headerFields: CartService.trimHeaderFields(null)
        });
        oComponent.setModel(oCartModel, Constants.MODELS.CART);

        // Count-only model for shell badge; Wishlist view holds its own items model
        const oWishlistModel = new JSONModel({ count: WishlistService.getAll().length });
        oComponent.setModel(oWishlistModel, Constants.MODELS.WISHLIST);

        const oOrderConfirmModel = new JSONModel({
            orderUuid: "",
            submittedAt: "",
            itemCount: 0,
            unpricedCount: 0,
            totalAmount: 0,
            totalCurrency: "EUR",
            externalReference: ""
        });
        oComponent.setModel(oOrderConfirmModel, Constants.MODELS.ORDER_CONFIRM);

        // Preload the catalog once
        oComponent.setModel(new JSONModel({ results: [], loaded: false }), Constants.MODELS.CATALOG);
        CatalogService.load(oComponent).catch(() => undefined); // already logged

        // Fills the shell badge and the cart model from the backend on app start
        void new CartService(oComponent).sync();

        // Starts the check whether the stored lists still belong to this user
        void listsReady().then((bDropped) => {
            if (bDropped) {this._refreshWishlistCount();}
        });
    }
}
