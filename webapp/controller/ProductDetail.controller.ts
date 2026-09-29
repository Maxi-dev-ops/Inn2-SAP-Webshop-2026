import BaseController from "./BaseController";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import Button from "sap/m/Button";
import SearchField, { type SearchField$SearchEvent } from "sap/m/SearchField";
import StepInput from "sap/m/StepInput";
import { type Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import formatter from "../model/formatter";
import CartService, { CatalogProduct } from "../model/CartService";
import WishlistService, { WishlistItem } from "../model/WishlistService";
import RecentlyViewedService from "../model/RecentlyViewedService";
import { buildDatasheetHtml } from "../model/datasheet";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class ProductDetailController extends BaseController {
    public readonly formatter = formatter;

    private _cartService: CartService | undefined;
    // Object URLs of opened datasheets, released in onExit
    private _aBlobUrls: string[] = [];

    // -- Lifecycle -- //

    public onInit(): void {
        this._cartService = new CartService(this.getOwnerComponent());

        const oDetailModel = new JSONModel({ hasBundleItems: false, addBusy: false, addProgress: "" });
        this.setModel(oDetailModel, Constants.MODELS.DETAIL);

        this._attachRoute(Constants.ROUTES.PRODUCT_DETAIL, this._onRouteMatched.bind(this));
    }

    public onExit(): void {
        super.onExit();
        this._aBlobUrls.forEach((sUrl) => { URL.revokeObjectURL(sUrl); });
        this._aBlobUrls = [];
    }

    // -- Routing & binding -- //

    private _onRouteMatched(oEvent: Route$PatternMatchedEvent): void {
        (this.byId("pdpSearchField") as SearchField | undefined)?.setValue("");

        const sUuid = (oEvent.getParameter("arguments") as { catalogItemUuid: string }).catalogItemUuid;
        const sPath = `/CatalogItem(guid'${sUuid}')`;

        this.getView()!.bindElement({
            path: sPath,
            parameters: {
                expand: "to_BundleItem",
                select: "CatalogItemUuid,ProductName,Material,NetPriceAmount,TransactionCurrency,"
                    + "ProductPictureUrl,ProductSalesDescription,addToShoppingCart_ac,"
                    + "to_BundleItem/BillOfMaterialItemUUID,to_BundleItem/BillOfMaterialComponent,"
                    + "to_BundleItem/ComponentDescription,to_BundleItem/BOMItemDescription,to_BundleItem/ProductPictureUrl"
            },
            events: {
                dataReceived: (oEvt: Event) => {
                    this._onDataReceived(oEvt);
                },
                change: () => {
                    this._checkBundleItems(sPath);
                }
            }
        });
    }

    private _onDataReceived(oEvent: Event<{data?: object}>): void {
        const oData = oEvent.getParameter("data") as {
            CatalogItemUuid?: string;
            ProductName?: string;
            Material?: string;
            NetPriceAmount?: number | string;
            TransactionCurrency?: string;
            ProductPictureUrl?: string;
        } | undefined;
        if (!oData || !oData.CatalogItemUuid) {
            // Also the answer to a hand-edited URL
            MessageToast.show(this._getText("productNotFound"));
            this._navTo(Constants.ROUTES.PRODUCT_LIST);
            return;
        }

        const nPrice = typeof oData.NetPriceAmount === "number"
            ? oData.NetPriceAmount
            : parseFloat(String(oData.NetPriceAmount ?? "0"));
        RecentlyViewedService.add({
            uuid: oData.CatalogItemUuid,
            name: oData.ProductName ?? "",
            material: oData.Material ?? "",
            price: isNaN(nPrice) ? 0 : nPrice,
            currency: oData.TransactionCurrency ?? "EUR",
            pictureUrl: oData.ProductPictureUrl ?? ""
        });

        const oBtn = this._wishlistBtn();
        if (oBtn) {
            this._paintHeart(oBtn, WishlistService.has(oData.CatalogItemUuid));
        }
    }

    private _checkBundleItems(sPath: string): void {
        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        const oDetailModel: JSONModel | undefined = this._json(Constants.MODELS.DETAIL);
        if (!oDetailModel) { return; }
        const aBundleItems = oModel.getProperty(`${sPath}/to_BundleItem`) as unknown[] | undefined;
        oDetailModel.setProperty("/hasBundleItems", Array.isArray(aBundleItems) && aBundleItems.length > 0);
    }

    // -- Search -- //

    public onSearch(oEvent: SearchField$SearchEvent): void {
        const sQuery = ((oEvent.getParameter("query") as string) ?? "").trim();
        this._navTo(Constants.ROUTES.PRODUCT_LIST, sQuery ? { "?query": { query: sQuery } } : {});
    }

    // -- Wishlist -- //

    private _wishlistBtn(): Button | undefined {
        return this.byId("pdpWishlistBtn") as Button | undefined;
    }

    public onToggleWishlist(): void {
        const oCtx = this.getView()!.getBindingContext();
        const oBtn = this._wishlistBtn();
        if (!oCtx || !oBtn) {return;}
        const oData = oCtx.getObject() as CatalogProduct;

        const oItem: WishlistItem = {
            uuid: oData.CatalogItemUuid,
            name: oData.ProductName,
            material: oData.Material,
            price: CartService.toNum(oData.NetPriceAmount),
            currency: oData.TransactionCurrency,
            pictureUrl: oData.ProductPictureUrl
        };
        this._toggleWishlistFromContext(oBtn, oItem, oData.ProductName);
    }

    // -- Cart -- //

    public onAddToCart(): void {
        const oCtx = this.getView()!.getBindingContext();
        if (!oCtx || !this._cartService) {return;}

        const oData = oCtx.getObject() as CatalogProduct;
        const oQtyInput = this.byId("pdpQtyInput") as StepInput | undefined;
        const oDetail = this._json(Constants.MODELS.DETAIL);

        // A busy overlay would hide the progress, so the controls only get locked
        this._addToCart(
            this._cartService, oData, oQtyInput ? oQtyInput.getValue() : 1,
            (bBusy, sProgress) => {
                oDetail.setProperty("/addBusy", bBusy);
                oDetail.setProperty("/addProgress", sProgress);
            },
            () => oQtyInput?.setValue(Constants.UI.STEP_INPUT_MIN)
        );
    }

    // -- Datasheet download -- //

    public onDownload(): void {
        const oCtx = this.getView()!.getBindingContext();
        if (!oCtx) {
            MessageToast.show(this._getText("productDataNotLoaded"));
            return;
        }

        const oData = oCtx.getObject() as {
            ProductName?: string;
            Material?: string;
            NetPriceAmount?: number | string;
            TransactionCurrency?: string;
            ProductSalesDescription?: string;
            ProductPictureUrl?: string;
        };

        const sHtml = buildDatasheetHtml(
            {
                name: oData.ProductName ?? "–",
                material: oData.Material ?? "–",
                priceText: formatter.formatPrice(CartService.toNum(oData.NetPriceAmount), oData.TransactionCurrency ?? "EUR"),
                description: oData.ProductSalesDescription ?? "",
                pictureUrl: oData.ProductPictureUrl ?? ""
            },
            {
                title: this._getText("datasheetTitle", [oData.ProductName ?? "–"]),
                subtitle: this._getText("datasheetSubtitle"),
                articleNo: this._getText("datasheetArticleNo"),
                listPrice: this._getText("datasheetListPrice"),
                description: this._getText("datasheetDescription"),
                printButton: this._getText("datasheetPrintButton")
            }
        );

        const oBlob = new Blob([sHtml], { type: "text/html;charset=utf-8" });
        const sBlobUrl = URL.createObjectURL(oBlob);
        const oWin = window.open(sBlobUrl, "_blank");
        if (!oWin) {
            URL.revokeObjectURL(sBlobUrl);
            MessageToast.show(this._getText("popupBlocked"));
            return;
        }
        // The sheet carries backend text, so it gets no handle back on this window
        oWin.opener = null;
        // The opened window needs the URL, so its released when this page goes away
        this._aBlobUrls.push(sBlobUrl);
    }
}
