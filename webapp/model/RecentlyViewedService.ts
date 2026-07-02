import Constants from "./Constants";
import { StoredItem, insertFront, seedOnce } from "./itemStore";

export type RecentlyViewedItem = StoredItem;

export default class RecentlyViewedService {

    // Demo placeholders seeded by seedDemo()
    private static readonly DEMO_ITEMS: RecentlyViewedItem[] = [
        { uuid: "demo-recent-001", name: "Monitor 27\" 4K", material: "MON-4K-27", price: 649.00, currency: "EUR", pictureUrl: "" },
        { uuid: "demo-recent-002", name: "Bürostuhl Ergonomic Plus", material: "CHAIR-ERGO-1", price: 399.00, currency: "EUR", pictureUrl: "" }
    ];

    private static _items: RecentlyViewedItem[] = [];
    private static _demoSeeded = false;

    /** Seeds the demo items */
    public static seedDemo(): void {
        if (RecentlyViewedService._demoSeeded) { return; }
        RecentlyViewedService._demoSeeded = true;
        RecentlyViewedService._items = seedOnce(RecentlyViewedService._items, RecentlyViewedService.DEMO_ITEMS);
    }

    /** Inserts at front, deduplicates by uuid, trims to max size. */
    public static add(oItem: RecentlyViewedItem): void {
        RecentlyViewedService._items = insertFront(RecentlyViewedService._items, oItem, Constants.STORAGE.RECENTLY_VIEWED_MAX);
    }

    public static getAll(): RecentlyViewedItem[] {
        return [...RecentlyViewedService._items];
    }

    public static clear(): void {
        RecentlyViewedService._items = [];
    }
}
