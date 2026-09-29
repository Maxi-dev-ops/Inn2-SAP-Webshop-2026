import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import Model from "sap/ui/model/Model";
import History from "sap/ui/core/routing/History";
import InvisibleMessage from "sap/ui/core/InvisibleMessage";
import { InvisibleMessageMode } from "sap/ui/core/library";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import ListBase from "sap/m/ListBase";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Log from "sap/base/Log";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import { type Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import WishlistService, { WishlistItem } from "../model/WishlistService";
import CartService, { CatalogProduct } from "../model/CartService";
import { errText, extractODataError } from "../model/odata";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class BaseController extends Controller {

    private _aRouteHandlers: Array<{ sRoute: string; fn: (oEvent: Route$PatternMatchedEvent) => void }> = [];

    public getOwnerComponent(): UIComponent {
        return super.getOwnerComponent() as UIComponent;
    }

    public setModel(oModel: Model, sName?: string): void {
        this.getView()!.setModel(oModel, sName);
    }

    public getModel(sName?: string): Model | undefined {
        return this.getView()!.getModel(sName);
    }

    // A named JSON model, typed. Reaches the view's own models as well as the ones the component holds - UI5 propagates those down to every view, so the lookup is the same either way.
    protected _json(sName: string): JSONModel {
        return this.getModel(sName) as JSONModel;
    }

    // The object a control's binding context points at 
    protected _ctxObject<T>(oEvent: Event<object, Control>, sModelName?: string): T | undefined {
        const oCtx = oEvent.getSource().getBindingContext(sModelName);
        return oCtx ? (oCtx.getObject() as T) : undefined;
    }

    // -- Routing -- //


    // Attaches a pattern-matched handler to a route to detach it again via onExit()
    protected _attachRoute(sRoute: string, fnHandler: (oEvent: Route$PatternMatchedEvent) => void): void {
        UIComponent.getRouterFor(this).getRoute(sRoute)!.attachPatternMatched(fnHandler);
        this._aRouteHandlers.push({ sRoute, fn: fnHandler });
    }

    protected _navTo(sRoute: string, oParams?: object, bReplace = false): void {
        UIComponent.getRouterFor(this).navTo(sRoute, oParams ?? {}, undefined, bReplace);
    }

    public onExit(): void {
        const oRouter = UIComponent.getRouterFor(this);
        this._aRouteHandlers.forEach((o) => oRouter.getRoute(o.sRoute)?.detachPatternMatched(o.fn));
        this._aRouteHandlers = [];
    }

    // -- Shared helpers (used across controllers) -- //

    protected _getText(sKey: string, aArgs?: (string | number)[]): string {
        const oBundle = (this.getOwnerComponent().getModel(Constants.MODELS.I18N) as ResourceModel).getResourceBundle() as ResourceBundle;
        return oBundle.getText(sKey, aArgs) ?? sKey;
    }

    // Reports a failed backend call
    protected _reportError(oErr: unknown, sFallbackKey: string, sLogMessage: string): void {
        Log.error(sLogMessage, errText(oErr));
        const sFallback = this._getText(sFallbackKey);
        MessageBox.error(extractODataError(oErr, sFallback), { title: sFallback });
    }

    public onImageError(oEvent: Event<object, Control>): void {
        oEvent.getSource().addStyleClass("webshopImageBroken");
    }

    // -- Cart -- //

    // The one way an article reaches the cart
    protected _addToCart(
        oCartService: CartService,
        oProduct: CatalogProduct,
        nQuantity: number,
        fnBusy: (bBusy: boolean, sProgress: string) => void,
        fnDone?: () => void
    ): void {
        const nUnits = CartService.units(nQuantity);
        const progress = (nDone: number): string => this._getText("addProgress", [nDone, nUnits]);

        fnBusy(true, progress(0));
        oCartService.addToCart(oProduct, nUnits, (nDone) => { fnBusy(true, progress(nDone)); }).then(() => {
            fnBusy(false, "");
            fnDone?.();
            const sMsg = this._getText("addedToCart", [oProduct.ProductName]);
            MessageToast.show(sMsg);
            InvisibleMessage.getInstance().announce(sMsg, InvisibleMessageMode.Polite);
        }, (oErr: unknown) => {
            fnBusy(false, "");
            this._reportError(oErr, "addToCartError", "addToShoppingCart error");
        });
    }

    // -- Wishlist -- //

    // Keeps the shell badge in step with the stored wishlist
    protected _refreshWishlistCount(): void {
        const oWishlistModel = this._json(Constants.MODELS.WISHLIST);
        oWishlistModel.setProperty("/count", WishlistService.getAll().length);
        oWishlistModel.refresh(true);
    }

    // Syncs the heart icons of a product list with the current wishlist state
    protected _updateHeartIcons(oList: ListBase, sModelName: string | undefined, sUuidProp: string): void {
        for (const oItem of oList.getItems()) {
            const oCtx = oItem.getBindingContext(sModelName);
            if (!oCtx) { continue; }
            const sUuid = (oCtx.getProperty(sUuidProp) as string) ?? "";
            const oHeartBtn = oItem.findAggregatedObjects(true).find(
                (c): c is Button => c.isA("sap.m.Button") && (c as Button).hasStyleClass("rsCardHeartBtn")
            );
            if (oHeartBtn) {
                this._paintHeart(oHeartBtn, WishlistService.has(sUuid));
            }
        }
    }

    // The two states of a heart button, in one place so list and detail page cannot drift.
    protected _paintHeart(oBtn: Button, bInWishlist: boolean): void {
        oBtn.setIcon(bInWishlist ? "sap-icon://heart" : "sap-icon://heart-2");
        oBtn.toggleStyleClass("rsCardHeartBtnActive", bInWishlist);
    }

    protected _toggleWishlistFromContext(
        oBtn: Button, oItem: WishlistItem, sProductName: string
    ): void {
        const bNowInWishlist = WishlistService.toggle(oItem);
        this._paintHeart(oBtn, bNowInWishlist);
        this._refreshWishlistCount();
        MessageToast.show(this._getText(bNowInWishlist ? "addedToWishlist" : "removedFromWishlist", [sProductName]));
    }

    // -- Navigation -- //

    public onNavBack(): void {
        const sPreviousHash = History.getInstance().getPreviousHash();
        if (sPreviousHash !== undefined) {
            window.history.go(-1);
        } else {
            this._navTo(Constants.ROUTES.HOME, {}, true);
        }
    }

    public onNavHome(): void {
        this._navTo(Constants.ROUTES.HOME);
    }

    public onNavToCart(): void {
        this._navTo(Constants.ROUTES.CART);
    }

    public onNavToWishlist(): void {
        this._navTo(Constants.ROUTES.WISHLIST);
    }

    public onNavToOrderHistory(): void {
        this._navTo(Constants.ROUTES.ORDER_HISTORY);
    }

    public onNavToProfile(): void {
        this._navTo(Constants.ROUTES.PROFILE);
    }
}
