import Storage from "sap/ui/util/Storage";

// An item kept in browser storage (wishlist, recently viewed)
export interface StoredItem {
    uuid: string;
    name: string;
    material: string;
    price: number;
    currency: string;
    pictureUrl: string;
}

// -- List helpers -- //

// Puts an item in front, drops an older entry with the same uuid and caps the list
export function insertFront<T extends StoredItem>(aItems: T[], oItem: T, nMaxSize: number): T[] {
    const aNext = aItems.filter((i) => i.uuid !== oItem.uuid);
    aNext.unshift(oItem);
    return aNext.slice(0, nMaxSize);
}

export function removeByUuid<T extends StoredItem>(aItems: T[], sUuid: string): T[] {
    return aItems.filter((i) => i.uuid !== sUuid);
}

export function hasUuid<T extends StoredItem>(aItems: T[], sUuid: string): boolean {
    return aItems.some((i) => i.uuid === sUuid);
}

// -- Persistence -- //

// UI5 local storage wrapper, keys prefixed with "inn2.webshop"
class Store {
    public static readonly instance = new Storage(Storage.Type.local, "inn2.webshop");
    // Key under which the owner of the stored lists is kept
    public static readonly USER_KEY = "lastUserId";
}

// What actually goes into storage
type PersistedItem = Omit<StoredItem, "price" | "currency">;

function isPersistedItem(v: unknown): v is PersistedItem {
    const o = v as Partial<StoredItem> | null;
    return !!o && typeof o.uuid === "string" && !!o.uuid
        && typeof o.name === "string" && typeof o.material === "string";
}

// Reads a persisted list; prices are not stored and come back as 0
export function loadStored<T extends StoredItem>(sKey: string): T[] {
    try {
        if (!Store.instance.isSupported()) {return [];}
        const aParsed = Store.instance.get(sKey) as unknown;
        if (!Array.isArray(aParsed)) {return [];}
        return aParsed.filter(isPersistedItem).map((o) => ({
            ...o, pictureUrl: o.pictureUrl ?? "", price: 0, currency: "EUR"
        })) as T[];
    } catch {
        return [];
    }
}

export function saveStored<T extends StoredItem>(sKey: string, aItems: T[]): void {
    try {
        if (!Store.instance.isSupported()) {return;}
        Store.instance.put(sKey, aItems.map(({ uuid, name, material, pictureUrl }) => ({
            uuid, name, material, pictureUrl
        })));
    } catch {
        // Storage unavailable: the list just is not persisted
    }
}

// -- Owner of the stored lists -- //

// Who the stored lists belong to; empty when nothing has been stored yet
export function storedUser(): string {
    try {
        if (!Store.instance.isSupported()) {return "";}
        const v = Store.instance.get(Store.USER_KEY) as unknown;
        return typeof v === "string" ? v : "";
    } catch {
        return "";
    }
}

export function rememberUser(sUserId: string): void {
    try {
        if (Store.instance.isSupported()) {Store.instance.put(Store.USER_KEY, sUserId);}
    } catch {
        // Storage unavailable: nothing to remember
    }
}

// True when the stored lists belong to someone else; without both ids nothing is dropped
export function isForeignUser(sUserId: string, sStored: string): boolean {
    return !!sUserId && !!sStored && sUserId !== sStored;
}
