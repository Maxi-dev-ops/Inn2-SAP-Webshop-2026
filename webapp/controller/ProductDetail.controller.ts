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

    // -- Lifecycle --

    public onInit(): void {
        this._cartService = new CartService(this.getOwnerComponent());

        const oDetailModel = new JSONModel({ hasBundleItems: false });
        this.setModel(oDetailModel, Constants.MODELS.DETAIL);

        this._attachRoute(Constants.ROUTES.PRODUCT_DETAIL, this._onRouteMatched.bind(this));
    }

    // -- Routing & binding --

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
            MessageToast.show(this._getText("productNotFound"));
            UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PRODUCT_LIST);
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

        this._updateWishlistBtn(WishlistService.has(oData.CatalogItemUuid));
    }

    private _checkBundleItems(sPath: string): void {
        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        const oDetailModel = this.getView()?.getModel(Constants.MODELS.DETAIL) as JSONModel | undefined;
        if (!oDetailModel) { return; }
        const aBundleItems = oModel.getProperty(`${sPath}/to_BundleItem`) as unknown[] | undefined;
        const bHasBundles = Array.isArray(aBundleItems) && aBundleItems.length > 0;
        oDetailModel.setProperty("/hasBundleItems", bHasBundles);
    }

    // -- Search --

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

    private _updateWishlistBtn(bInWishlist: boolean): void {
        const oBtn = this.byId("pdpWishlistBtn") as Button | undefined;
        if (!oBtn) {return;}
        oBtn.setIcon(bInWishlist ? "sap-icon://heart" : "sap-icon://heart-2");
        if (bInWishlist) {
            oBtn.addStyleClass("rsCardHeartBtnActive");
        } else {
            oBtn.removeStyleClass("rsCardHeartBtnActive");
        }
    }

    public onToggleWishlist(): void {
        const oCtx = this.getView()!.getBindingContext();
        if (!oCtx) {return;}
        const oData = oCtx.getObject() as CatalogProduct;
        const oBtn = this.byId("pdpWishlistBtn") as Button;

        const oItem: WishlistItem = {
            uuid: oData.CatalogItemUuid,
            name: oData.ProductName,
            material: oData.Material,
            price: CartService.toNum(oData.NetPriceAmount),
            currency: oData.TransactionCurrency,
            pictureUrl: oData.ProductPictureUrl
        };
        this._toggleWishlistFromContext(oBtn, oItem, oData.ProductName, (bNow) => {
            this._updateWishlistBtn(bNow);
        });
    }

    // -- Cart --

    public onAddToCart(): void {
        const oCtx = this.getView()!.getBindingContext();
        if (!oCtx) {return;}

        const oData = oCtx.getObject() as CatalogProduct;
        const oBtn = this.byId("addToCartBtn") as Button;
        const oQtyInput = this.byId("pdpQtyInput") as StepInput | undefined;
        const nQty = oQtyInput ? oQtyInput.getValue() : 1;
        oBtn.setBusy(true);

        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        oModel.callFunction(Constants.ODATA.FUNCTION_ADD_TO_CART, {
            method: "POST",
            urlParameters: { CatalogItemUuid: oData.CatalogItemUuid },
            success: () => {
                oBtn.setBusy(false);
                this._cartService?.addItem(oData, nQty);
                if (oQtyInput) {oQtyInput.setValue(Constants.UI.STEP_INPUT_MIN);}
                const sMsg = this._getText("addedToCart", [oData.ProductName]);
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

    public onBundleImageError(oEvent: Event<object, Control>): void {
        oEvent.getSource().addStyleClass("webshopImageBroken");
    }

    // -- Datasheet download --

    public onDownload(): void {
        const oCtx = this.getView()!.getBindingContext();
        if (!oCtx) {
            MessageToast.show(this._getText("productDataNotLoaded"));
            return;
        }

        const oData = oCtx.getObject() as {
            ProductName?: string;
            Material?: string;
            NetPriceAmount?: number;
            TransactionCurrency?: string;
            ProductSalesDescription?: string;
            ProductPictureUrl?: string;
        };

        const sHtml = buildDatasheetHtml(
            {
                name: oData.ProductName ?? "–",
                material: oData.Material ?? "–",
                price: oData.NetPriceAmount,
                currency: oData.TransactionCurrency ?? "",
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
        }
    }
}
