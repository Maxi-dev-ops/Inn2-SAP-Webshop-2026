import BaseController from "./BaseController";
import formatter from "../model/formatter";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class OrderConfirmController extends BaseController {
    public readonly formatter = formatter;

    public onInit(): void {
        this._attachRoute(Constants.ROUTES.ORDER_CONFIRM, this._onRouteMatched.bind(this));
    }

    private _onRouteMatched(): void {
        const sOrderUuid = String(this._json(Constants.MODELS.ORDER_CONFIRM)?.getProperty("/orderUuid") ?? "");

        // Direct URL access without a prior order, redirects to home
        if (!sOrderUuid) {
            this._navTo(Constants.ROUTES.HOME, {}, true);
            return;
        }

        // Prevent browser back to the now-empty cart page
        history.replaceState(null, "", location.href);
    }
}
