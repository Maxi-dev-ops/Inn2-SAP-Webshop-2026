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
    CreationDateTime?: Date | string;
    orderShoppingCart_ac?: boolean;
    to_ApproverStatus?: { DomainValue_Text?: string };
}

//Reads submitted carts as the order history
export default class OrderService {
    // anything beyond that is not fetched at all
    private static readonly MAX_ORDERS = 100;
    // Orders younger than this show right away
    private static readonly RECENT_MONTHS = 1;
    // Orders older than this are deleted
    private static readonly MAX_AGE_MONTHS = 12;

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

    public static mapOrders(aRaw: RawOrder[], dNow = new Date()): Order[] {
        const aSubmitted = aRaw.filter((r) => r.orderShoppingCart_ac === false && !!r.ShoppingCartUuid);
        return OrderService.byAge(OrderService.mapSubmitted(aSubmitted), aSubmitted, dNow);
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
                itemCount: 0,
                totalAmount: CartService.toNum(r.NetAmount),
                currency: r.CurrencyCode ?? "EUR",
                items: [],
                expanded: false,
                itemsLoaded: false
            }));
    }

    public static byAge(aOrders: Order[], aRaw: RawOrder[], dNow = new Date()): Order[] {
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

    // Whole weeks between an order and now
    public static weeksAgo(nTime: number, dNow = new Date()): number {
        const nWeekMs = 7 * 24 * 60 * 60 * 1000;
        return Math.max(0, Math.floor((dNow.getTime() - nTime) / nWeekMs));
    }

    // Groups the older list
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
