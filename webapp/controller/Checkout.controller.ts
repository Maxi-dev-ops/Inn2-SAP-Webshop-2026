import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import DateFormat from "sap/ui/core/format/DateFormat";
import { type Router$RouteMatchedEvent } from "sap/ui/core/routing/Router";
import formatter from "../model/formatter";
import CartService, { CartHeaderFields, CartState, HeaderField } from "../model/CartService";
import Constants from "../model/Constants";

/**
 * Last step before the order: this page collects a customer reference, a remark and a deviating
 * delivery address. They are written before orderShoppingCart runs
 *
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class CheckoutController extends BaseController {
    public readonly formatter = formatter;

    // Pages the typed values survive. Moving between cart, checkout, wishlist and profile is part
    // of placing the order; going to a product or the home page is leaving the order behind.
    private static readonly KEEP_ROUTES: readonly string[] = [
        Constants.ROUTES.CART, Constants.ROUTES.CHECKOUT,
        Constants.ROUTES.WISHLIST, Constants.ROUTES.PROFILE
    ];

    private _cartService: CartService | undefined;

    private _fnLeaveWatch?: (oEvent: Router$RouteMatchedEvent) => void;

    // -- Lifecycle -- //

    public onInit(): void {
        this._cartService = new CartService(this.getOwnerComponent());
        this.setModel(new JSONModel(CheckoutController.emptyState()), Constants.MODELS.CHECKOUT);
        this._attachRoute(Constants.ROUTES.CHECKOUT, this._onRouteMatched.bind(this));

        // Every route is watched, not just the one visited before the checkout: on a way like
        // checkout -> home -> cart -> checkout the previous route alone would say "keep", so the
        // form has to be dropped the moment a page outside the group is reached.
        this._fnLeaveWatch = (oEvent: Router$RouteMatchedEvent): void => {
            if (!CheckoutController.KEEP_ROUTES.includes(oEvent.getParameter("name") ?? "")) {
                this._resetForm();
            }
        };
        // Listener has to be the same object on detach, otherwise the handler is never removed
        this.getOwnerComponent().getRouter().attachRouteMatched(this._fnLeaveWatch, this);
    }

    public onExit(): void {
        if (this._fnLeaveWatch) {
            this.getOwnerComponent().getRouter().detachRouteMatched(this._fnLeaveWatch, this);
            this._fnLeaveWatch = undefined;
        }
        super.onExit();
    }

    // Empties the form; the next visit prefills it from the cart header again
    private _resetForm(): void {
        const oModel = this._json(Constants.MODELS.CHECKOUT);
        oModel.setData(CheckoutController.emptyState());
        oModel.refresh(true);
    }

    // Field values plus the per-field error state the form binds against
    private static emptyState(): Record<string, unknown> {
        const oStates: Record<string, string> = {};
        const oStateTexts: Record<string, string> = {};
        for (const sKey of CartService.headerFieldNames()) {
            oStates[sKey] = "None";
            oStateTexts[sKey] = "";
        }
        return {
            // Cart the form belongs to
            cartUuid: "",
            fields: CartService.trimHeaderFields(null),
            deviatingAddress: false,
            busy: false,
            states: oStates,
            stateTexts: oStateTexts
        };
    }

    // Entering with an empty cart would offer an order that cannot go out, so the page bounces back to the cart
    private _onRouteMatched(): void {
        const oCartModel = this._json(Constants.MODELS.CART);
        const pReady = this._hasOrderableCart(oCartModel)
            ? Promise.resolve()
            : (this._cartService?.sync() ?? Promise.resolve());

        void pReady.then(() => {
            if (!this._hasOrderableCart(oCartModel)) {
                MessageToast.show(this._getText("checkoutEmptyCart"));
                this._navTo(Constants.ROUTES.CART, {}, true);
                return;
            }

            const oModel = this._json(Constants.MODELS.CHECKOUT);
            const sCartUuid = String(oCartModel.getProperty("/cartUuid") ?? "");
            // Rebuilt for a new cart and after _resetForm() emptied the cart UUID. Stepping back
            // to the cart and returning keeps what was typed; that is a normal thing to do.
            if (oModel.getProperty("/cartUuid") === sCartUuid) {return;}

            const oFields = CartService.trimHeaderFields(
                oCartModel.getProperty("/headerFields") as Partial<CartHeaderFields> | undefined
            );
            oModel.setData({
                ...CheckoutController.emptyState(),
                cartUuid: sCartUuid,
                fields: oFields,
                deviatingAddress: CheckoutController.hasDelivery(oFields)
            });
            oModel.refresh(true);
        });
    }

    private _hasOrderableCart(oCartModel: JSONModel): boolean {
        const sCartUuid = String(oCartModel.getProperty("/cartUuid") ?? "");
        return !!sCartUuid && (oCartModel.getProperty("/count") as number) > 0;
    }

    // True when the stored header already carries a deviating address
    public static hasDelivery(oFields: CartHeaderFields): boolean {
        return !!(oFields.DeliveryStreet || oFields.DeliveryPostalCode || oFields.DeliveryCity || oFields.DeliveryCountry);
    }

    // -- Form -- //

    // Unchecking only hides the address; what was typed stays in the model so re-checking brings it back
    public onToggleDeviatingAddress(): void {
        this._clearFieldStates();
    }

    // Clears the red frame as soon as the user types, instead of leaving it until the next order
    public onFieldChange(): void {
        this._clearFieldStates();
    }

    private _clearFieldStates(): void {
        const oModel = this._json(Constants.MODELS.CHECKOUT);
        for (const sKey of CartService.headerFieldNames()) {
            oModel.setProperty(`/states/${sKey}`, "None");
            oModel.setProperty(`/stateTexts/${sKey}`, "");
        }
    }

    // Validates the input in the checkout page
    private _validate(): boolean {
        const oModel = this._json(Constants.MODELS.CHECKOUT);
        this._clearFieldStates();

        const oErrors = CartService.validateHeader(
            oModel.getProperty("/fields") as CartHeaderFields,
            oModel.getProperty("/deviatingAddress") as boolean
        );
        const aKeys = Object.keys(oErrors) as HeaderField[];
        for (const sKey of aKeys) {
            oModel.setProperty(`/states/${sKey}`, "Error");
            oModel.setProperty(`/stateTexts/${sKey}`, this._getText(oErrors[sKey]!));
        }
        if (aKeys.length) {
            MessageBox.warning(this._getText("checkoutFieldsInvalid"));
        }
        return aKeys.length === 0;
    }

    // -- Order -- //

    public onOrder(): void {
        if (!this._validate()) {return;}

        const oCartModel = this._json(Constants.MODELS.CART);
        const sCartUuid = String(oCartModel.getProperty("/cartUuid") ?? "");
        if (!this._cartService || !sCartUuid) {
            MessageToast.show(this._getText("orderNoCart"));
            return;
        }

        const oModel = this._json(Constants.MODELS.CHECKOUT);
        const oFields = oModel.getProperty("/fields") as CartHeaderFields;
        // An unchecked box must not leave an old address on the cart from an earlier visit
        const oPayload = oModel.getProperty("/deviatingAddress") === true
            ? oFields
            : CartService.clearDelivery(oFields);

        oModel.setProperty("/busy", true);

        // The header has to be on the cart before it is ordered
        this._cartService.saveHeader(sCartUuid, oPayload)
            .then(() => this._cartService!.order(sCartUuid))
            .then(() => {
                oModel.setProperty("/busy", false);
                this._onOrdered(oCartModel, sCartUuid, oPayload);
            })
            .catch((oErr: unknown) => {
                oModel.setProperty("/busy", false);
                this._reportError(oErr, "orderError", "Checkout failed");
            });
    }

    // Fills the confirmation page from the same totals the cart showed and empties the cart
    private _onOrdered(oCartModel: JSONModel, sCartUuid: string, oFields: CartHeaderFields): void {
        MessageToast.show(this._getText("orderSubmitted"));

        const oTotals = CartService.calcTotals(oCartModel.getData() as CartState);
        const oOrderConfirm = this._json(Constants.MODELS.ORDER_CONFIRM);
        oOrderConfirm.setData({
            orderUuid: sCartUuid,
            submittedAt: DateFormat.getDateTimeInstance({ style: "medium" }).format(new Date()),
            itemCount: oTotals.itemCount,
            unpricedCount: oTotals.unpricedCount,
            totalAmount: oTotals.amount,
            totalCurrency: oTotals.currency,
            externalReference: oFields.ExternalReference
        });

        this._cartService?.setItems([]);
        oCartModel.setProperty("/totalAmount", 0);
        oCartModel.setProperty("/cartUuid", "");
        oCartModel.setProperty("/headerFields", CartService.trimHeaderFields(null));

        this._navTo(Constants.ROUTES.ORDER_CONFIRM);
    }

    public onBackToCart(): void {
        this._navTo(Constants.ROUTES.CART);
    }

    // -- Formatters -- //

    // Counter under the remark field, so the 256-character limit is visible
    public formatRemarkCounter(sRemark: string): string {
        return this._getText("checkoutCharsLeft", [
            CartService.HEADER_RULES.Remark.maxLength - (sRemark ?? "").length
        ]);
    }
}
