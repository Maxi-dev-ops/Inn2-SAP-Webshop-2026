import BaseController from "./BaseController";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import UIComponent from "sap/ui/core/UIComponent";
import Log from "sap/base/Log";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import SearchField, { type SearchField$SearchEvent } from "sap/m/SearchField";
import { type ListBase$UpdateFinishedEvent } from "sap/m/ListBase";
import formatter from "../model/formatter";
import CartService from "../model/CartService";
import Constants from "../model/Constants";
import { WishlistItem } from "../model/WishlistService";
import RecentlyViewedService from "../model/RecentlyViewedService";

interface HomeCategory {
    uuid: string;
    title: string;
}

interface HomeProduct {
    uuid: string;
    name: string;
    material: string;
    price: number;
    currency: string;
    pictureUrl: string;
}

interface RawCatalog {
    CatalogUuid?: string;
    Title?: string;
    CatalogId?: string;
}

interface RawCatalogItem {
    CatalogItemUuid?: string;
    ProductName?: string;
    Material?: string;
    NetPriceAmount?: string;
    TransactionCurrency?: string;
    ProductPictureUrl?: string;
}

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class HomeController extends BaseController {
    public readonly formatter = formatter;
    private _loadFeaturedSeq: number = 0;

    // -- Lifecycle & routing --

    public onInit(): void {
        const aRecent = RecentlyViewedService.getAll();
        const oHomeModel = new JSONModel({
            categories: [],
            featured: [],
            featuredLoading: true,
            featuredVisible: false,
            recentlyViewed: aRecent,
            recentlyViewedCount: aRecent.length,
            hasRecentlyViewed: aRecent.length > 0
        });
        this.setModel(oHomeModel, "home");
        this._loadCategories();
        this._loadFeatured();

        this._attachRoute(Constants.ROUTES.HOME, this._onRouteMatched.bind(this));
    }

    private _onRouteMatched(): void {
        (this.byId("homeSearchField") as SearchField | undefined)?.setValue("");
        const aRecent = RecentlyViewedService.getAll();
        const oHome = this._getHomeModel();
        oHome.setProperty("/recentlyViewed", aRecent);
        oHome.setProperty("/recentlyViewedCount", aRecent.length);
        oHome.setProperty("/hasRecentlyViewed", aRecent.length > 0);
    }

    private _getHomeModel(): JSONModel {
        return this.getModel("home") as JSONModel;
    }

    // -- Data loading --

    private _loadCategories(): void {
        const oCatalogCache = this.getOwnerComponent().getModel(Constants.MODELS.CATALOG) as JSONModel | undefined;
        if (oCatalogCache?.getProperty("/loaded") === true) {
            const aRaw = oCatalogCache.getProperty("/results") as RawCatalog[];
            const aCached: HomeCategory[] = aRaw.map((c) => ({
                uuid: c.CatalogUuid ?? "",
                title: c.Title || this._getText("catalogFallback", [c.CatalogId ?? ""])
            }));
            this._getHomeModel().setProperty("/categories", aCached);
            return;
        }
        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        if (!oModel) {return;}
        oModel.read(Constants.ODATA.ENTITY_CATALOG, {
            urlParameters: {
                $orderby: "CatalogId asc",
                $select: Constants.ODATA.SELECT_CATALOG
            },
            success: (oData: { results?: RawCatalog[] }) => {
                const aResults = oData.results ?? [];
                const aCats: HomeCategory[] = aResults.map((c) => ({
                    uuid: c.CatalogUuid ?? "",
                    title: c.Title || this._getText("catalogFallback", [c.CatalogId ?? ""])
                }));
                this._getHomeModel().setProperty("/categories", aCats);
                oCatalogCache?.setProperty("/results", aResults);
                oCatalogCache?.setProperty("/loaded", true);
            },
            error: (oErr: unknown) => {
                Log.warning("Home categories load failed.", this._errText(oErr));
            }
        });
    }

    private _loadFeatured(): void {
        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        if (!oModel) {return;}
        this._loadFeaturedSeq++;
        const nSeq = this._loadFeaturedSeq;
        this._getHomeModel().setProperty("/featuredLoading", true);
        oModel.read(Constants.ODATA.ENTITY_CATALOG_ITEM, {
            urlParameters: {
                $top: "8",
                $orderby: "ProductName asc",
                $select: "CatalogItemUuid,ProductName,Material,NetPriceAmount,TransactionCurrency,ProductPictureUrl"
            },
            success: (oData: { results?: RawCatalogItem[] }) => {
                if (nSeq !== this._loadFeaturedSeq) { return; }
                const aItems: HomeProduct[] = (oData.results ?? []).map((r) => ({
                    uuid: r.CatalogItemUuid ?? "",
                    name: r.ProductName ?? "",
                    material: r.Material ?? "",
                    price: CartService.toNum(r.NetPriceAmount),
                    currency: r.TransactionCurrency ?? "EUR",
                    pictureUrl: r.ProductPictureUrl ?? ""
                }));
                const oHome = this._getHomeModel();
                oHome.setProperty("/featured", aItems);
                oHome.setProperty("/featuredLoading", false);
                oHome.setProperty("/featuredVisible", true);
            },
            error: (oErr: unknown) => {
                if (nSeq !== this._loadFeaturedSeq) { return; }
                Log.warning("Home featured products load failed.", this._errText(oErr));
                const oHome = this._getHomeModel();
                oHome.setProperty("/featuredLoading", false);
                oHome.setProperty("/featuredVisible", true);
            }
        });
    }

    // -- Event handlers --

    public onProductPress(oEvent: Event<object, Control>): void {
        const oCtx = oEvent.getSource().getBindingContext("home");
        if (!oCtx) {return;}
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PRODUCT_DETAIL, {
            catalogItemUuid: oCtx.getProperty("uuid") as string
        });
    }

    public onCategoryPress(oEvent: Event<object, Control>): void {
        const oCtx = oEvent.getSource().getBindingContext("home");
        const sUuid = oCtx ? (oCtx.getProperty("uuid") as string) : "";
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PRODUCT_LIST, {
            "?query": sUuid ? { catalog: sUuid } : {}
        });
    }

    public onExplore(): void {
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PRODUCT_LIST);
    }

    public onSearch(oEvent: SearchField$SearchEvent): void {
        const sQuery = ((oEvent.getParameter("query") as string) ?? "").trim();
        if (sQuery) {
            UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PRODUCT_LIST, {
                "?query": { query: sQuery }
            });
        } else {
            UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PRODUCT_LIST);
        }
    }

    // -- Wishlist --

    public onListUpdateFinished(oEvent: ListBase$UpdateFinishedEvent): void {
        this._updateHeartIcons(oEvent.getSource(), "home", "uuid");
    }

    public onToggleWishlist(oEvent: Event<object, Button>): void {
        const oBtn = oEvent.getSource();
        const oCtx = oBtn.getBindingContext("home");
        if (!oCtx) {return;}
        const oProduct = oCtx.getObject() as HomeProduct;

        const oItem: WishlistItem = {
            uuid: oProduct.uuid,
            name: oProduct.name,
            material: oProduct.material,
            price: oProduct.price,
            currency: oProduct.currency,
            pictureUrl: oProduct.pictureUrl
        };
        this._toggleWishlistFromContext(oBtn, oItem, oProduct.name);
    }
}
