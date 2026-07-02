import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import formatter from "../model/formatter";
import Constants from "../model/Constants";

interface OrderItem {
    name: string;
    material: string;
    quantity: number;
    price: number;
    currency: string;
}

interface Order {
    uuid: string;
    date: string;
    status: "completed" | "processing" | "shipped" | "cancelled";
    itemCount: number;
    items: OrderItem[];
    totalAmount: number;
    currency: string;
    expanded: boolean;
}

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class OrderHistoryController extends BaseController {
    public readonly formatter = formatter;

    public onInit(): void {
        this._attachRoute(Constants.ROUTES.ORDER_HISTORY, this._onRouteMatched.bind(this));
        this.setModel(new JSONModel({ orders: [], hasOrders: false, showEmpty: true, showList: false }), "orderHistoryModel");
    }

    private _onRouteMatched(): void {
        // Demo data only, requires OData entity set for real data
        const aOrders = this._isDemoMode() ? this._getDemoOrders() : [];
        const oModel = this.getModel("orderHistoryModel") as JSONModel;
        oModel.setProperty("/orders", aOrders);
        oModel.setProperty("/hasOrders", aOrders.length > 0);
        oModel.setProperty("/showEmpty", aOrders.length === 0);
        oModel.setProperty("/showList", aOrders.length > 0);
    }

    /** Demo data only, requires OData entity set for real data */
    private _getDemoOrders(): Order[] {
        return [
            {
                uuid: "ORD-2026-0042",
                date: "12.06.2026",
                status: "completed",
                itemCount: 2,
                items: [
                    { name: "Laptop Business Pro", material: "T-MOBILE-0001", quantity: 2, price: 1299.00, currency: "EUR" },
                    { name: "Docking Station", material: "T-DOCK-001", quantity: 1, price: 149.90, currency: "EUR" }
                ],
                totalAmount: 2747.90,
                currency: "EUR",
                expanded: false
            },
            {
                uuid: "ORD-2026-0037",
                date: "05.06.2026",
                status: "shipped",
                itemCount: 1,
                items: [
                    { name: "Bürostuhl Ergonomic Plus", material: "CHAIR-ERGO-1", quantity: 5, price: 399.00, currency: "EUR" }
                ],
                totalAmount: 1995.00,
                currency: "EUR",
                expanded: false
            },
            {
                uuid: "ORD-2026-0031",
                date: "27.05.2026",
                status: "completed",
                itemCount: 2,
                items: [
                    { name: "Monitor 27\" 4K", material: "MON-4K-27", quantity: 3, price: 649.00, currency: "EUR" },
                    { name: "HDMI-Kabel 2m", material: "CABLE-HDMI-2", quantity: 6, price: 12.90, currency: "EUR" }
                ],
                totalAmount: 2024.40,
                currency: "EUR",
                expanded: false
            }
        ];
    }

    public onToggleOrderDetails(oEvent: Event<object, Control>): void {
        const oCtx = oEvent.getSource().getBindingContext("orderHistoryModel");
        if (!oCtx) { return; }
        const sPath = oCtx.getPath();
        const oModel = this.getModel("orderHistoryModel") as JSONModel;
        const bExpanded = oModel.getProperty(`${sPath}/expanded`) as boolean;
        oModel.setProperty(`${sPath}/expanded`, !bExpanded);
    }

    // -- Formatters --

    public formatOrderStatus(sStatus: string): string {
        const oMap: Record<string, string> = {
            completed: this._getText("orderStatusCompleted"),
            processing: this._getText("orderStatusProcessing"),
            shipped: this._getText("orderStatusShipped"),
            cancelled: this._getText("orderStatusCancelled")
        };
        return oMap[sStatus] ?? sStatus;
    }

    public formatOrderStatusState(sStatus: string): string {
        const oMap: Record<string, string> = {
            completed: "Success",
            processing: "Warning",
            shipped: "Information",
            cancelled: "Error"
        };
        return oMap[sStatus] ?? "None";
    }

    public formatToggleText(bExpanded: boolean): string {
        return bExpanded ? this._getText("orderHideDetails") : this._getText("orderToggleDetails");
    }

    public formatToggleIcon(bExpanded: boolean): string {
        return bExpanded ? "sap-icon://navigation-up-arrow" : "sap-icon://navigation-down-arrow";
    }
}
