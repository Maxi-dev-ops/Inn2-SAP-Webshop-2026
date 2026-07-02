import Constants from "./Constants";
import { StoredItem, hasUuid, insertFront, removeByUuid, seedOnce } from "./itemStore";

export type WishlistItem = StoredItem;

export default class WishlistService {

    // Demo placeholders seeded by seedDemo()
    private static readonly DEMO_ITEMS: WishlistItem[] = [
        { uuid: "demo-wish-001", name: "Laptop Business Pro", material: "T-MOBILE-0001", price: 1299.00, currency: "EUR", pictureUrl: "" },
        { uuid: "demo-wish-002", name: "Docking Station Ultra", material: "T-DOCK-001", price: 149.90, currency: "EUR", pictureUrl: "" }
    ];

    private static _items: WishlistItem[] = [];
    private static _demoSeeded = false;

    /** Seeds the demo items */
    public static seedDemo(): void {
        if (WishlistService._demoSeeded) { return; }
        WishlistService._demoSeeded = true;
        WishlistService._items = seedOnce(WishlistService._items, WishlistService.DEMO_ITEMS);
    }

    /** Adds/Deletes an item */
    public static toggle(oItem: WishlistItem): boolean {
        if (hasUuid(WishlistService._items, oItem.uuid)) {
            WishlistService._items = removeByUuid(WishlistService._items, oItem.uuid);
            return false;
        }
        WishlistService._items = insertFront(WishlistService._items, oItem, Constants.STORAGE.WISHLIST_MAX);
        return true;
    }

    public static getAll(): WishlistItem[] {
        return [...WishlistService._items];
    }

    public static has(sUuid: string): boolean {
        return hasUuid(WishlistService._items, sUuid);
    }

    public static clear(): void {
        WishlistService._items = [];
    }
}
