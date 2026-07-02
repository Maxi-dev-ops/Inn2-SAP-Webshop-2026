import BaseController from "./BaseController";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import Log from "sap/base/Log";
import CartService from "../model/CartService";
import WishlistService from "../model/WishlistService";
import RecentlyViewedService from "../model/RecentlyViewedService";
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
            showEmpty: false,
            showItems: false
        });
        oComponent.setModel(oCartModel, Constants.MODELS.CART);

        // Count-only model for shell badge; Wishlist view holds its own items model
        const oWishlistModel = new JSONModel({ count: WishlistService.getAll().length });
        oComponent.setModel(oWishlistModel, Constants.MODELS.WISHLIST);

        const oOrderConfirmModel = new JSONModel({
            orderUuid: "",
            submittedAt: "",
            itemCount: 0,
            totalAmount: 0,
            totalCurrency: "EUR"
        });
        oComponent.setModel(oOrderConfirmModel, Constants.MODELS.ORDER_CONFIRM);

        // Preload the catalog once so Home and PLP avoid duplicate /Catalog requests
        const oCatalogModel = new JSONModel({ results: [], loaded: false });
        oComponent.setModel(oCatalogModel, Constants.MODELS.CATALOG);
        const oODataModel = oComponent.getModel() as ODataModel | null;
        if (oODataModel) {
            oODataModel.read(Constants.ODATA.ENTITY_CATALOG, {
                urlParameters: {
                    $orderby: "CatalogId asc",
                    $select: Constants.ODATA.SELECT_CATALOG
                },
                success: (oData: { results?: Array<{ CatalogUuid: string; Title: string; CatalogId: string }> }) => {
                    oCatalogModel.setProperty("/results", oData.results ?? []);
                    oCatalogModel.setProperty("/loaded", true);
                },
                error: () => {
                    // Home and PLP retry /Catalog independently (loaded stays false)
                    Log.warning("App catalog preload failed - Home/PLP will load /Catalog independently.");
                }
            });
        }

        new CartService(oComponent).preload();

        if (this._isDemoMode()) {
            this._seedDemoData();
        }
    }

    /** Only in demo mode; Seeds demo data (wishlist + recently viewed) and refreshes the shell badge */
    private _seedDemoData(): void {
        WishlistService.seedDemo();
        RecentlyViewedService.seedDemo();
        const oWishlistModel = this.getOwnerComponent().getModel(Constants.MODELS.WISHLIST) as JSONModel;
        oWishlistModel.setProperty("/count", WishlistService.getAll().length);
        oWishlistModel.refresh(true);
    }
}
