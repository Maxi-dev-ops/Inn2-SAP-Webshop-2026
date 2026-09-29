import Constants from "./Constants";
import { StoredItem, hasUuid, insertFront, loadStored, removeByUuid, saveStored } from "./itemStore";

export type WishlistItem = StoredItem;

export default class WishlistService {

    private static readonly STORAGE_KEY = "wishlist";
    private static _items: WishlistItem[] = loadStored<WishlistItem>(WishlistService.STORAGE_KEY);

    private static _persist(): void {
        saveStored(WishlistService.STORAGE_KEY, WishlistService._items);
    }

    // Drops the list; used when a different user opens the shop in this browser
    public static clear(): void {
        WishlistService._items = [];
        WishlistService._persist();
    }

    public static toggle(oItem: WishlistItem): boolean {
        if (hasUuid(WishlistService._items, oItem.uuid)) {
            WishlistService._items = removeByUuid(WishlistService._items, oItem.uuid);
            WishlistService._persist();
            return false;
        }
        WishlistService._items = insertFront(WishlistService._items, oItem, Constants.STORAGE.WISHLIST_MAX);
        WishlistService._persist();
        return true;
    }

    public static getAll(): WishlistItem[] {
        return [...WishlistService._items];
    }

    public static has(sUuid: string): boolean {
        return hasUuid(WishlistService._items, sUuid);
    }
}
