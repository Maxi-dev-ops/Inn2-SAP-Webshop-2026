import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
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
        const oModel = this._json(Constants.MODELS.CART);
        const bHasItems = ((oModel.getProperty("/items") as CartItem[] | undefined) ?? []).length > 0;

        // Keep the current list visible while the backend answers
        oModel.setProperty("/loading", !bHasItems);
        CartService.updateVisibility(oModel);

        void this._cartService?.sync();
    }

    private _row(oEvent: Event): CartItem | undefined {
        return this._ctxObject<CartItem>(oEvent, Constants.MODELS.CART);
    }

    // -- Quantity & removal -- //

    // One more unit means one more backend position
    public onIncreaseQty(oEvent: Event): void {
        const oItem = this._row(oEvent);
        if (!oItem || !this._cartService) {return;}

        // addToShoppingCart call
        this._cartService.addUnit(oItem).catch((oErr: unknown) => {
            this._reportError(oErr, "addToCartError", "Cart addUnit failed");
        });
    }

    // Second way to change the amount
    public onQuantityInput(oEvent: Event<object, Input>): void {
        const oInput = oEvent.getSource();
        const oItem = this._row(oEvent);
        if (!oItem || !this._cartService) {return;}

        const nWanted = parseNumberInRange(oInput.getValue(), 0, Constants.UI.STEP_INPUT_MAX, true);
        if (nWanted === null) {
            // Put current value back
            oInput.setValue(String(oItem.quantity));
            MessageToast.show(this._getText("qtyRangeInvalid", [Constants.UI.STEP_INPUT_MAX]));
            return;
        }

        this._cartService.setQuantity(oItem, nWanted).catch((oErr: unknown) => {
            this._reportError(oErr, "addToCartError", "Cart setQuantity failed");
        });
    }

    public onDecreaseQty(oEvent: Event): void {
        const oItem = this._row(oEvent);
        if (!oItem) {return;}
        this._removeUnits(oItem, 1);
    }

    public onRemoveItem(oEvent: Event): void {
        const oItem = this._row(oEvent);
        if (!oItem) {return;}
        this._removeUnits(oItem);
        MessageToast.show(this._getText("itemRemoved", [oItem.name]));
    }

    // Without nUnits the whole row goes; sync() in the CartService restores the row if the backend refuses
    private _removeUnits(oItem: CartItem, nUnits?: number): void {
        this._cartService?.removeUnits(oItem, nUnits).catch((oErr: unknown) => {
            this._reportError(oErr, "removeItemError", "Cart item DELETE failed");
        });
    }

    // -- Checkout -- //

    // The checkout page collects header fields first and places the order
    public onCheckout(): void {
        const oCartModel: JSONModel = this._json(Constants.MODELS.CART);
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
