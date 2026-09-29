import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Log from "sap/base/Log";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import List from "sap/m/List";
import { type SegmentedButton$SelectionChangeEvent } from "sap/m/SegmentedButton";
import ListBinding from "sap/ui/model/ListBinding";
import Context from "sap/ui/model/Context";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Sorter from "sap/ui/model/Sorter";
import DateFormat from "sap/ui/core/format/DateFormat";
import formatter from "../model/formatter";
import OrderService, { Order, OrderItem } from "../model/OrderService";
import CartService, { ReorderResult } from "../model/CartService";
import { errText } from "../model/odata";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class OrderHistoryController extends BaseController {
    public readonly formatter = formatter;

    // Name of this page's view model
    private static readonly MODEL = "orderHistoryModel";

    private _cartService: CartService | undefined;
    // Which of the two lists the binding currently carries
    private _appliedView: string | undefined;

    private _model(): JSONModel {
        return this._json(OrderHistoryController.MODEL);
    }

    public onInit(): void {
        this._cartService = new CartService(this.getOwnerComponent());
        this._attachRoute(Constants.ROUTES.ORDER_HISTORY, this._onRouteMatched.bind(this));
        this.setModel(new JSONModel({
            orders: [], loading: true, showEmpty: false, showList: false, hasOrders: false,
            // "recent" or "older"
            view: OrderHistoryController.VIEW_RECENT,
            recentCount: 0, olderCount: 0,
            reordering: false, reorderText: ""
        }), OrderHistoryController.MODEL);
    }

    private static readonly VIEW_RECENT = "recent";
    private static readonly VIEW_OLDER = "older";

    private _onRouteMatched(): void {
        const oModel = this._model();
        oModel.setProperty("/loading", true);
        this._setVisibility(oModel);

        OrderService.load(this.getOwnerComponent()).then((aOrders) => {
            this._setOrders(aOrders);
        }, () => {
            // Already logged in service; show the empty state instead of stale list
            this._setOrders([]);
        });
    }

    private _setOrders(aOrders: Order[]): void {
        const oModel = this._model();
        oModel.setProperty("/orders", aOrders);
        oModel.setProperty("/loading", false);
        this._setVisibility(oModel);
        oModel.refresh(true);
        this._applyView();
    }

    private _setVisibility(oModel: JSONModel): void {
        const bLoading = oModel.getProperty("/loading") as boolean;
        const aOrders = (oModel.getProperty("/orders") as Order[] | undefined) ?? [];
        const nOlder = aOrders.filter((o) => o.older).length;
        const bOlderView = oModel.getProperty("/view") === OrderHistoryController.VIEW_OLDER;
        const nVisible = bOlderView ? nOlder : aOrders.length - nOlder;

        oModel.setProperty("/recentCount", aOrders.length - nOlder);
        oModel.setProperty("/olderCount", nOlder);
        oModel.setProperty("/hasOrders", aOrders.length > 0);
        oModel.setProperty("/showEmpty", !bLoading && aOrders.length > 0 && nVisible === 0);
        oModel.setProperty("/showList", !bLoading && nVisible > 0);
    }

    // Switches between the two lists (recent, older)
    private _applyView(): void {
        const oBinding = (this.byId("orderList") as List | undefined)?.getBinding("items") as ListBinding | undefined;
        if (!oBinding) {return;}

        const bOlder = this._isOlderView();
        const sView = bOlder ? OrderHistoryController.VIEW_OLDER : OrderHistoryController.VIEW_RECENT;
        // Filtering fires a re-render
        if (this._appliedView === sView) {return;}
        this._appliedView = sView;

        oBinding.filter([new Filter("older", FilterOperator.EQ, bOlder)]);
        oBinding.sort([new Sorter("time", true, (oContext: Context) => this._groupHeader(oContext, bOlder))]);
    }

    public onAfterRendering(): void {
        this._applyView();
    }

    private _isOlderView(): boolean {
        return this._model().getProperty("/view") === OrderHistoryController.VIEW_OLDER;
    }

    // Heading above a group
    private _groupHeader(oContext: Context, bOlder: boolean): { key: string; text: string } {
        const oOrder = oContext.getObject() as Order;
        if (bOlder) {
            const nMonth = OrderService.monthKey(oOrder.time);
            return {
                key: String(nMonth),
                text: DateFormat.getDateInstance({ pattern: "MMMM yyyy" }).format(new Date(nMonth))
            };
        }
        const nWeeks = OrderService.weeksAgo(oOrder.time);
        return { key: String(nWeeks), text: this.formatWeekGroup(nWeeks) };
    }

    // Week heading
    public formatWeekGroup(nWeeks: number): string {
        if (nWeeks <= 0) {return this._getText("orderWeekThis");}
        if (nWeeks === 1) {return this._getText("orderWeekLast");}
        return this._getText("orderWeeksAgo", [nWeeks]);
    }

    // The segmented control at the top to show older or recent
    public onSelectView(oEvent: SegmentedButton$SelectionChangeEvent): void {
        const oModel = this._model();
        const sKey = oEvent.getParameter("item")?.getKey() ?? OrderHistoryController.VIEW_RECENT;

        if (sKey === OrderHistoryController.VIEW_OLDER && (oModel.getProperty("/olderCount") as number) === 0) {
            MessageToast.show(this._getText("orderNoOlder"));
            oModel.setProperty("/view", OrderHistoryController.VIEW_RECENT);
            oModel.refresh(true);
            return;
        }

        oModel.setProperty("/view", sKey);
        this._setVisibility(oModel);
        oModel.refresh(true);
        this._applyView();
    }

    // Positions are fetched on the first expand
    public onToggleOrderDetails(oEvent: Event<object, Control>): void {
        const oCtx = oEvent.getSource().getBindingContext(OrderHistoryController.MODEL);
        if (!oCtx) { return; }

        const sPath = oCtx.getPath();
        const oModel = this._model();
        const oOrder = oCtx.getObject() as Order;
        const bExpanded = !oOrder.expanded;
        oModel.setProperty(`${sPath}/expanded`, bExpanded);

        if (!bExpanded || oOrder.itemsLoaded) { return; }

        OrderService.loadItems(this.getOwnerComponent(), oOrder.cartUuid).then((aItems) => {
            oModel.setProperty(`${sPath}/items`, aItems);
            oModel.setProperty(`${sPath}/itemCount`, aItems.reduce((s, i) => s + i.quantity, 0));
            oModel.setProperty(`${sPath}/itemsLoaded`, true);
            oModel.refresh(true);
        }, (oErr: unknown) => {
            Log.warning("Order items load failed.", errText(oErr));
            oModel.setProperty(`${sPath}/expanded`, false);
        });
    }

    // -- Reorder -- //

    // Puts every position of a placed order back into the cart and navigates there
    public onReorder(oEvent: Event<object, Control>): void {
        const oCtx = oEvent.getSource().getBindingContext(OrderHistoryController.MODEL);
        if (!oCtx || !this._cartService) {return;}

        const oModel = this._model();
        if (oModel.getProperty("/reordering") === true) {return;}

        const sPath = oCtx.getPath();
        const oOrder = oCtx.getObject() as Order;

        oModel.setProperty("/reordering", true);
        oModel.setProperty("/reorderText", this._getText("orderReorderRunning"));

        this._orderItems(oOrder, sPath)
            .then((aItems) => {
                if (!aItems.length) {
                    throw new Error("reorder: order has no positions");
                }
                return this._cartService!.reorder(
                    aItems.map((i) => ({
                        name: i.name, material: i.material, quantity: i.quantity,
                        price: i.price, currency: i.currency
                    })),
                    (nDone, nTotal) => {
                        oModel.setProperty("/reorderText", this._getText("orderReorderProgress", [nDone, nTotal]));
                    }
                );
            })
            .then((oResult) => {
                oModel.setProperty("/reordering", false);
                oModel.setProperty("/reorderText", "");
                this._afterReorder(oResult);
            })
            .catch((oErr: unknown) => {
                oModel.setProperty("/reordering", false);
                oModel.setProperty("/reorderText", "");
                this._reportError(oErr, "orderReorderError", "Reorder failed");
            });
    }

    // Uses the already loaded positions, otherwise fetches appends them
    private _orderItems(oOrder: Order, sPath: string): Promise<OrderItem[]> {
        if (oOrder.itemsLoaded) {return Promise.resolve(oOrder.items);}

        return OrderService.loadItems(this.getOwnerComponent(), oOrder.cartUuid).then((aItems) => {
            const oModel = this._model();
            oModel.setProperty(`${sPath}/items`, aItems);
            oModel.setProperty(`${sPath}/itemCount`, aItems.reduce((s, i) => s + i.quantity, 0));
            oModel.setProperty(`${sPath}/itemsLoaded`, true);
            oModel.refresh(true);
            return aItems;
        });
    }

    // A material the catalog no longer resolves is skipped and are named before the cart opens
    private _afterReorder(oResult: ReorderResult): void {
        if (!oResult.added) {
            MessageBox.error(this._getText("orderReorderNoneAdded", [oResult.failed.join(", ")]));
            return;
        }

        const fnGoToCart = (): void => { this._navTo(Constants.ROUTES.CART); };
        if (oResult.failed.length) {
            MessageBox.warning(this._getText("orderReorderPartial", [oResult.added, oResult.failed.join(", ")]), {
                onClose: fnGoToCart
            });
            return;
        }

        MessageToast.show(this._getText("orderReorderDone", [oResult.added]));
        fnGoToCart();
    }

    // Order positions carry only a material, so the product page has to be looked up. If material is no longer available user gets info
    public onViewProduct(oEvent: Event<object, Control>): void {
        const oItem = this._ctxObject<OrderItem>(oEvent, OrderHistoryController.MODEL);
        if (!oItem || !this._cartService) {return;}
        this._cartService.resolveCatalogUuid({ material: oItem.material }).then((sCatalogUuid) => {
            this._navTo(Constants.ROUTES.PRODUCT_DETAIL, { catalogItemUuid: sCatalogUuid });
        }, (oErr: unknown) => {
            Log.warning(`No catalog item for material ${oItem.material}`, errText(oErr));
            MessageToast.show(this._getText("orderProductGone", [oItem.name]));
        });
    }

    // -- Formatters -- //

    // Falls back to the raw code when the service delivers status wording
    public formatOrderStatus(sStatus: string, sStatusText: string): string {
        return sStatusText || sStatus || "";
    }

    public formatOrderStatusState(sStatus: string): string {
        return sStatus === Constants.ORDER_STATUS.ORDERED ? "Success" : "Information";
    }

    public formatToggleText(bExpanded: boolean): string {
        return this._getText(bExpanded ? "orderHideDetails" : "orderToggleDetails");
    }

    public formatToggleIcon(bExpanded: boolean): string {
        return bExpanded ? "sap-icon://navigation-up-arrow" : "sap-icon://navigation-down-arrow";
    }

    // Empty until the details were opened once
    public formatOrderItemCount(nCount: number, bLoaded: boolean): string {
        return bLoaded ? `${nCount} ${this._getText("orderItems")}` : this._getText("orderShowItems");
    }
}
