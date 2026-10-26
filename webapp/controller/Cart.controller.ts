import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import InvisibleMessage from "sap/ui/core/InvisibleMessage";
import { InvisibleMessageMode } from "sap/ui/core/library";
import Event from "sap/ui/base/Event";
import Input from "sap/m/Input";
import formatter from "../model/formatter";
import CartService, { CartItem } from "../model/CartService";
import { parseNumberInRange } from "../model/validation";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class CartController extends BaseController {
    public readonly formatter = formatter;

    private _cartService: CartService | undefined;

    // -- Lifecycle -- //

    public onInit(): void {
        this._cartService = new CartService(this.getOwnerComponent());
        this._attachRoute(Constants.ROUTES.CART, this._onRouteMatched.bind(this));
    }

    // -- Loading (cart items + header) -- //

    private _onRouteMatched(): void {
        const oModel = this._jsonModel(Constants.MODELS.CART);
        const bHasItems = ((oModel.getProperty("/items") as CartItem[] | undefined) ?? []).length > 0;

        // Keep the current list visible while the backend answers
        oModel.setProperty("/loading", !bHasItems);
        CartService.updateVisibility(oModel);

        void this._cartService?.syncFromBackend();
    }

    private _rowFromEvent(oEvent: Event): CartItem | undefined {
        return this._ctxObject<CartItem>(oEvent, Constants.MODELS.CART);
    }

    // -- Quantity & removal -- //

    // One more unit means one more backend position
    public onIncreaseQty(oEvent: Event): void {
        const oItem = this._rowFromEvent(oEvent);
        if (!oItem || !this._cartService) {return;}

        this._cartService.addUnit(oItem).then(() => { this._announceQuantity(oItem); }, (oErr: unknown) => {
            this._reportError(oErr, "addToCartError", "Cart addUnit failed");
        });
    }

    // Second way to change the amount
    public onQuantityInput(oEvent: Event<object, Input>): void {
        const oInput = oEvent.getSource();
        const oItem = this._rowFromEvent(oEvent);
        if (!oItem || !this._cartService) {return;}

        const nWanted = parseNumberInRange(oInput.getValue(), 0, Constants.UI.STEP_INPUT_MAX, true);
        if (nWanted === null) {
            // Unusable input: show the current quantity again
            oInput.setValue(String(oItem.quantity));
            MessageToast.show(this._getText("qtyRangeInvalid", [Constants.UI.STEP_INPUT_MAX]));
            return;
        }

        this._cartService.setQuantity(oItem, nWanted).then(() => { this._announceQuantity(oItem); }, (oErr: unknown) => {
            this._reportError(oErr, "addToCartError", "Cart setQuantity failed");
        });
    }

    public onDecreaseQty(oEvent: Event): void {
        const oItem = this._rowFromEvent(oEvent);
        if (!oItem) {return;}
        this._removeUnits(oItem, 1, () => { this._announceQuantity(oItem); });
    }

    public onRemoveItem(oEvent: Event): void {
        const oItem = this._rowFromEvent(oEvent);
        if (!oItem) {return;}
        this._removeUnits(oItem);
        MessageToast.show(this._getText("itemRemoved", [oItem.name]));
    }

    // Without nUnits the whole row goes; syncFromBackend() restores the row if the backend refuses
    private _removeUnits(oItem: CartItem, nUnits?: number, fnDone?: () => void): void {
        this._cartService?.removeUnits(oItem, nUnits).then(fnDone, (oErr: unknown) => {
            this._reportError(oErr, "removeItemError", "Cart item DELETE failed");
        });
    }

    // Quantity changes show no toast, so screen readers hear the new quantity from here
    private _announceQuantity(oItem: CartItem): void {
        const sKey = CartService.productMatchKey(oItem);
        const oRow = this._cartService?.getItems().find((i) => CartService.productMatchKey(i) === sKey);
        const sText = oRow
            ? this._getText("cartQtyChanged", [oItem.name, oRow.quantity])
            : this._getText("itemRemoved", [oItem.name]);
        InvisibleMessage.getInstance().announce(sText, InvisibleMessageMode.Polite);
    }

    // -- Checkout -- //

    // The checkout page collects header fields first and places the order
    public onCheckout(): void {
        const oCartModel: JSONModel = this._jsonModel(Constants.MODELS.CART);
        if (!String(oCartModel.getProperty("/cartUuid") ?? "")) {
            MessageToast.show(this._getText("orderNoCart"));
            return;
        }
        this._navTo(Constants.ROUTES.CHECKOUT);
    }

    public onContinueShopping(): void {
        this._navTo(Constants.ROUTES.PRODUCT_LIST);
    }

    // -- Formatters -- //

    public formatCartItemsTitle(nCount: number): string {
        return this._getText(nCount === 1 ? "cartItemsInCartOne" : "cartItemsInCart", [nCount]);
    }
}
