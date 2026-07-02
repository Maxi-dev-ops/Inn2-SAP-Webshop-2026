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
import MessageToast from "sap/m/MessageToast";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import { type Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import WishlistService, { WishlistItem } from "../model/WishlistService";
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

    // -- Routing --

    /**
     * Attaches a pattern-matched handler to a route to detach it again via the shared onExit()
     */
    protected _attachRoute(sRoute: string, fnHandler: (oEvent: Route$PatternMatchedEvent) => void): void {
        UIComponent.getRouterFor(this).getRoute(sRoute)!.attachPatternMatched(fnHandler);
        this._aRouteHandlers.push({ sRoute, fn: fnHandler });
    }

    public onExit(): void {
        const oRouter = UIComponent.getRouterFor(this);
        this._aRouteHandlers.forEach((o) => oRouter.getRoute(o.sRoute)?.detachPatternMatched(o.fn));
        this._aRouteHandlers = [];
    }

    // -- Shared helpers (used across controllers) --

    protected _getText(sKey: string, aArgs?: (string | number)[]): string {
        const oBundle = (this.getOwnerComponent().getModel(Constants.MODELS.I18N) as ResourceModel).getResourceBundle() as ResourceBundle;
        return oBundle.getText(sKey, aArgs) ?? sKey;
    }

    protected _isDemoMode(): boolean {
        const oConfig = this.getOwnerComponent().getModel(Constants.MODELS.CONFIG) as JSONModel | undefined;
        return oConfig?.getProperty("/demoMode") === true;
    }

    /** Raw error text of an OData V2 error */
    protected _errText(oErr: unknown): string {
        return (oErr as { responseText?: string })?.responseText ?? "";
    }

    /** Extracts a readable error message from an SAP OData V2 error */
    protected _extractODataError(oErr: unknown, sFallback: string): string {
        const sResp = this._errText(oErr);
        if (!sResp) {return sFallback;}
        try {
            const oResp = JSON.parse(sResp) as { error?: { message?: { value?: string } } };
            return oResp?.error?.message?.value ?? sFallback;
        } catch {
            const oMatch = sResp.match(/<message[^>]*>([^<]+)<\/message>/i);
            return oMatch?.[1] ?? sFallback;
        }
    }

    public onImageError(oEvent: Event<object, Control>): void {
        oEvent.getSource().addStyleClass("webshopImageBroken");
    }

    protected _announceCartUpdate(sText: string): void {
        InvisibleMessage.getInstance().announce(sText, InvisibleMessageMode.Polite);
    }

    /** Syncs the heart icons of a product list with the current wishlist state. */
    protected _updateHeartIcons(oList: ListBase, sModelName: string | undefined, sUuidProp: string): void {
        for (const oItem of oList.getItems()) {
            const oCtx = oItem.getBindingContext(sModelName);
            if (!oCtx) { continue; }
            const sUuid = (oCtx.getProperty(sUuidProp) as string) ?? "";
            const bInWishlist = WishlistService.has(sUuid);
            const oHeartBtn = oItem.findAggregatedObjects(true).find(
                (c): c is Button => c.isA("sap.m.Button") && (c as Button).hasStyleClass("rsCardHeartBtn")
            );
            if (oHeartBtn) {
                oHeartBtn.setIcon(bInWishlist ? "sap-icon://heart" : "sap-icon://heart-2");
                oHeartBtn.toggleStyleClass("rsCardHeartBtnActive", bInWishlist);
            }
        }
    }

    protected _toggleWishlistFromContext(
        oBtn: Button, oItem: WishlistItem, sProductName: string,
        fnPostToggle?: (bNowInWishlist: boolean) => void
    ): void {
        const bNowInWishlist = WishlistService.toggle(oItem);
        oBtn.setIcon(bNowInWishlist ? "sap-icon://heart" : "sap-icon://heart-2");
        oBtn.toggleStyleClass("rsCardHeartBtnActive", bNowInWishlist);
        const oWishlistModel = this.getOwnerComponent().getModel(Constants.MODELS.WISHLIST) as JSONModel;
        oWishlistModel.setProperty("/count", WishlistService.getAll().length);
        oWishlistModel.refresh(true);
        MessageToast.show(this._getText(bNowInWishlist ? "addedToWishlist" : "removedFromWishlist", [sProductName]));
        fnPostToggle?.(bNowInWishlist);
    }

    // -- Navigation --

    public onNavBack(): void {
        const sPreviousHash = History.getInstance().getPreviousHash();
        if (sPreviousHash !== undefined) {
            window.history.go(-1);
        } else {
            UIComponent.getRouterFor(this).navTo(Constants.ROUTES.HOME, {}, undefined, true);
        }
    }

    public onNavHome(): void {
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.HOME);
    }

    public onNavToCart(): void {
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.CART);
    }

    public onNavToWishlist(): void {
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.WISHLIST);
    }

    public onNavToOrderHistory(): void {
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.ORDER_HISTORY);
    }

    public onNavToProfile(): void {
        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PROFILE);
    }
}
