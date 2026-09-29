import BaseController from "./BaseController";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import Log from "sap/base/Log";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import SearchField, { type SearchField$SearchEvent } from "sap/m/SearchField";
import { type ListBase$UpdateFinishedEvent } from "sap/m/ListBase";
import formatter from "../model/formatter";
import CartService from "../model/CartService";
import CatalogService from "../model/CatalogService";
import Constants from "../model/Constants";
import { errText } from "../model/odata";
import { WishlistItem } from "../model/WishlistService";
import RecentlyViewedService, { RecentlyViewedItem } from "../model/RecentlyViewedService";
import { listsReady } from "../model/userScope";

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

    // -- Lifecycle & routing -- //

    public onInit(): void {
        // _loadRecentlyViewed() fills it once listsReady() is ready
        const oHomeModel = new JSONModel({
            categories: [],
            featured: [],
            featuredLoading: true,
            featuredVisible: false,
            recentlyViewed: [],
            recentlyViewedCount: 0,
            hasRecentlyViewed: false
        });
        this.setModel(oHomeModel, "home");
        this._loadCategories();
        this._loadFeatured();

        this._attachRoute(Constants.ROUTES.HOME, this._onRouteMatched.bind(this));
    }

    private _onRouteMatched(): void {
        (this.byId("homeSearchField") as SearchField | undefined)?.setValue("");
        this._loadRecentlyViewed();
    }

    // Waits for listsReady(): the list may still belong to the previous user and is about to be dropped 
    private _loadRecentlyViewed(): void {
        void listsReady().then(() => {
            const aRecent = RecentlyViewedService.getAll();
            this._setRecentlyViewed(aRecent);
            void CatalogService.withPrices(this.getOwnerComponent(), aRecent)
                .then((aPriced) => { this._setRecentlyViewed(aPriced); });
        });
    }

    private _setRecentlyViewed(aRecent: RecentlyViewedItem[]): void {
        const oHome = this._getHomeModel();
        oHome.setProperty("/recentlyViewed", aRecent);
        oHome.setProperty("/recentlyViewedCount", aRecent.length);
        oHome.setProperty("/hasRecentlyViewed", aRecent.length > 0);
        oHome.refresh(true);
    }

    private _getHomeModel(): JSONModel {
        return this._json("home");
    }

    // -- Data loading -- //

    private _loadCategories(): void {
        CatalogService.load(this.getOwnerComponent()).then((aResults) => {
            const aCats: HomeCategory[] = aResults.map((c) => ({
                uuid: c.CatalogUuid ?? "",
                title: c.Title || this._getText("catalogFallback", [c.CatalogId ?? ""])
            }));
            this._getHomeModel().setProperty("/categories", aCats);
        }).catch(() => undefined); // CatalogService already logged it
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
                Log.warning("Home featured products load failed.", errText(oErr));
                const oHome = this._getHomeModel();
                oHome.setProperty("/featuredLoading", false);
                oHome.setProperty("/featuredVisible", true);
            }
        });
    }

    // -- Event handlers -- //

    public onProductPress(oEvent: Event<object, Control>): void {
        const oProduct = this._ctxObject<HomeProduct>(oEvent, "home");
        if (!oProduct) {return;}
        this._navTo(Constants.ROUTES.PRODUCT_DETAIL, { catalogItemUuid: oProduct.uuid });
    }

    public onCategoryPress(oEvent: Event<object, Control>): void {
        const sUuid = this._ctxObject<HomeCategory>(oEvent, "home")?.uuid ?? "";
        this._navTo(Constants.ROUTES.PRODUCT_LIST, { "?query": sUuid ? { catalog: sUuid } : {} });
    }

    public onExplore(): void {
        this._navTo(Constants.ROUTES.PRODUCT_LIST);
    }

    public onSearch(oEvent: SearchField$SearchEvent): void {
        const sQuery = ((oEvent.getParameter("query") as string) ?? "").trim();
        this._navTo(Constants.ROUTES.PRODUCT_LIST, sQuery ? { "?query": { query: sQuery } } : {});
    }

    // -- Wishlist -- //

    public onListUpdateFinished(oEvent: ListBase$UpdateFinishedEvent): void {
        this._updateHeartIcons(oEvent.getSource(), "home", "uuid");
    }

    public onToggleWishlist(oEvent: Event<object, Button>): void {
        const oBtn = oEvent.getSource();
        const oProduct = this._ctxObject<HomeProduct>(oEvent, "home");
        if (!oProduct) {return;}

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
