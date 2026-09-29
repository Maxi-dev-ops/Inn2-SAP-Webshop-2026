import Constants from "./Constants";
import { StoredItem, insertFront, loadStored, saveStored } from "./itemStore";

export type RecentlyViewedItem = StoredItem;

export default class RecentlyViewedService {

    private static readonly STORAGE_KEY = "recentlyViewed";
    private static _items: RecentlyViewedItem[] = loadStored<RecentlyViewedItem>(RecentlyViewedService.STORAGE_KEY);

    private static _persist(): void {
        saveStored(RecentlyViewedService.STORAGE_KEY, RecentlyViewedService._items);
    }

    // Drops the list; used when a different user opens the shop in this browser
    public static clear(): void {
        RecentlyViewedService._items = [];
        RecentlyViewedService._persist();
    }

    public static add(oItem: RecentlyViewedItem): void {
        RecentlyViewedService._items = insertFront(RecentlyViewedService._items, oItem, Constants.STORAGE.RECENTLY_VIEWED_MAX);
        RecentlyViewedService._persist();
    }

    public static getAll(): RecentlyViewedItem[] {
        return [...RecentlyViewedService._items];
    }
}
