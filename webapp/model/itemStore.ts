import Storage from "sap/ui/util/Storage";

export interface StoredItem {
    uuid: string;
    name: string;
    material: string;
    price: number;
    currency: string;
    pictureUrl: string;
}

// Inserts an item at the front, removes entry with the same uuid
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

// Uses the UI5 storage wrapper (sap/ui/util/Storage) instead of raw localStorage
class Store {
    public static readonly instance = new Storage(Storage.Type.local, "inn2.webshop");
    // Owner Key for the stored lists
    public static readonly USER_KEY = "lastUserId";
}

// What actually goes into storage
type PersistedItem = Omit<StoredItem, "price" | "currency">;

function isPersistedItem(v: unknown): v is PersistedItem {
    const o = v as Partial<StoredItem> | null;
    return !!o && typeof o.uuid === "string" && !!o.uuid
        && typeof o.name === "string" && typeof o.material === "string";
}

// Reads a persisted list
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
        // Nothing to do
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
        // Nothing to do
    }
}

// True when the lists in this browser were left behind by someone else. If it is a empty id nothing is thrown away.
export function isForeignUser(sUserId: string, sStored: string): boolean {
    return !!sUserId && !!sStored && sUserId !== sStored;
}
