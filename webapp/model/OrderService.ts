import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import UIComponent from "sap/ui/core/UIComponent";
import DateFormat from "sap/ui/core/format/DateFormat";
import Log from "sap/base/Log";
import CartService from "./CartService";
import Constants from "./Constants";
import { errText, readList } from "./odata";

export interface OrderItem {
    name: string;
    material: string;
    quantity: number;
    price: number;
    currency: string;
}

export interface Order {
    older: boolean;
    time: number;
    orderId: string;
    cartUuid: string;
    date: string;
    // '1' is open, '5' is ordered
    status: string;
    statusText: string;
    // Backend's colour for the status: 1 negative, 2 critical, 3 positive, 0 or missing neutral
    statusCriticality: number;
    // Customer reference, remark and deviating delivery address as entered at checkout
    reference: string;
    remark: string;
    deliveryAddress: string;
    // False while a search hides this order
    match: boolean;
    itemCount: number;
    totalAmount: number;
    currency: string;
    items: OrderItem[];
    expanded: boolean;
    itemsLoaded: boolean;
}

interface RawOrder {
    ShoppingCartUuid?: string;
    ShoppingCartId?: string;
    NetAmount?: string;
    CurrencyCode?: string;
    ApproverStatus?: string;
    ApproverStatusCriticality?: number | string;
    CreationDateTime?: Date | string;
    orderShoppingCart_ac?: boolean;
    ExternalReference?: string;
    Remark?: string;
    DeliveryStreet?: string;
    DeliveryPostalCode?: string;
    DeliveryCity?: string;
    DeliveryCountry?: string;
    to_ApproverStatus?: { DomainValue_Text?: string };
}

// Reads submitted carts as the order history
export default class OrderService {
    // Newest carts read at most
    private static readonly MAX_ORDERS = 100;
    // Orders younger than this show right away
    private static readonly RECENT_MONTHS = 1;
    // Orders older than this are not shown
    private static readonly MAX_AGE_MONTHS = 12;

    // -- Backend reads -- //

    public static load(oComponent: UIComponent): Promise<Order[]> {
        const oModel = oComponent.getModel(Constants.MODELS.CART_SERVICE) as ODataModel | null;
        if (!oModel) {return Promise.resolve([]);}

        return readList<RawOrder>(oModel, Constants.ODATA.ENTITY_CART, {
            $top: String(OrderService.MAX_ORDERS),
            $orderby: "CreationDateTime desc",
            $expand: "to_ApproverStatus",
            $select: Constants.ODATA.SELECT_ORDER
        }).then(
            (aRows) => OrderService.mapOrders(aRows),
            (oErr: unknown) => {
                Log.warning("Order history load failed.", errText(oErr));
                throw oErr;
            }
        );
    }

    public static loadItems(oComponent: UIComponent, sCartUuid: string): Promise<OrderItem[]> {
        const oModel = oComponent.getModel(Constants.MODELS.CART_SERVICE) as ODataModel | null;
        if (!oModel || !sCartUuid) {return Promise.resolve([]);}

        return readList<Record<string, unknown>>(oModel, Constants.ODATA.ENTITY_CART_ITEM, {
            $filter: `ShoppingCartUuid eq guid'${sCartUuid}'`,
            $select: Constants.ODATA.SELECT_CART_ITEM
        }).then((aRows) => CartService.groupItems(CartService.mapRawItems(aRows)).map((i) => ({
            name: i.name,
            material: i.material,
            quantity: i.quantity,
            price: i.price,
            currency: i.currency
        })));
    }

    // -- Mapping -- //

    public static mapOrders(aRaw: RawOrder[], dNow = new Date()): Order[] {
        const aSubmitted = aRaw.filter((r) => r.orderShoppingCart_ac === false && !!r.ShoppingCartUuid);
        return OrderService.bucketByAge(OrderService.mapSubmitted(aSubmitted), aSubmitted, dNow);
    }

    private static mapSubmitted(aRaw: RawOrder[]): Order[] {
        return aRaw
            .map((r) => ({
                older: false,
                time: 0,
                orderId: (r.ShoppingCartId ?? "").replace(/^0+/, "") || (r.ShoppingCartUuid ?? "").slice(-12),
                cartUuid: r.ShoppingCartUuid ?? "",
                date: OrderService.formatDate(r.CreationDateTime),
                status: r.ApproverStatus ?? "",
                statusText: (r.to_ApproverStatus?.DomainValue_Text ?? "").trim(),
                statusCriticality: CartService.toNumber(r.ApproverStatusCriticality),
                reference: (r.ExternalReference ?? "").trim(),
                remark: (r.Remark ?? "").trim(),
                deliveryAddress: OrderService.formatAddress(r),
                match: true,
                itemCount: 0,
                totalAmount: CartService.toNumber(r.NetAmount),
                currency: r.CurrencyCode ?? "EUR",
                items: [],
                expanded: false,
                itemsLoaded: false
            }));
    }

    // Marks orders older than RECENT_MONTHS and drops those beyond MAX_AGE_MONTHS
    public static bucketByAge(aOrders: Order[], aRaw: RawOrder[], dNow = new Date()): Order[] {
        const monthsAgo = (nMonths: number): number => {
            const d = new Date(dNow.getTime());
            d.setMonth(d.getMonth() - nMonths);
            return d.getTime();
        };
        const nRecent = monthsAgo(OrderService.RECENT_MONTHS);
        const nOldest = monthsAgo(OrderService.MAX_AGE_MONTHS);

        return aOrders
            .map((o, i) => {
                const vDate = aRaw[i]?.CreationDateTime;
                const oDate = vDate instanceof Date ? vDate : new Date(String(vDate ?? ""));
                const nTime = isNaN(oDate.getTime()) ? Date.now() : oDate.getTime();
                return { order: { ...o, older: nTime < nRecent, time: nTime }, time: nTime };
            })
            .filter((x) => x.time >= nOldest)
            .map((x) => x.order);
    }

    // One line out of the delivery fields; empty when no deviating address was given
    public static formatAddress(r: RawOrder): string {
        const sTown = [r.DeliveryPostalCode, r.DeliveryCity].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
        return [r.DeliveryStreet, sTown, r.DeliveryCountry].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
    }

    // -- Status & search -- //

    // ValueState of the status badge; the backend's criticality wins, the status code is the fallback
    public static statusState(sStatus: string, nCriticality: number | null | undefined): string {
        switch (nCriticality) {
            case 1: return "Error";
            case 2: return "Warning";
            case 3: return "Success";
            default: return sStatus === Constants.ORDER_STATUS.ORDERED ? "Success" : "Information";
        }
    }

    // Case-insensitive match on customer reference or order number; an empty query matches all
    public static matchesQuery(oOrder: Pick<Order, "reference" | "orderId">, sQuery: string): boolean {
        const sNeedle = sQuery.trim().toLowerCase();
        if (!sNeedle) {return true;}
        return oOrder.reference.toLowerCase().includes(sNeedle) || oOrder.orderId.toLowerCase().includes(sNeedle);
    }

    // -- Date helpers -- //

    // Whole weeks between an order and now
    public static weeksAgo(nTime: number, dNow = new Date()): number {
        const nWeekMs = 7 * 24 * 60 * 60 * 1000;
        return Math.max(0, Math.floor((dNow.getTime() - nTime) / nWeekMs));
    }

    // Month bucket the older orders are grouped by
    public static monthKey(nTime: number): number {
        const oDate = new Date(nTime);
        return new Date(oDate.getFullYear(), oDate.getMonth(), 1).getTime();
    }

    public static formatDate(vDate: Date | string | undefined): string {
        if (!vDate) {return "";}
        const oDate = vDate instanceof Date ? vDate : new Date(vDate);
        if (isNaN(oDate.getTime())) {return "";}
        return DateFormat.getDateInstance({ style: "medium" }).format(oDate);
    }
}
