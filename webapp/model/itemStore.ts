export interface StoredItem {
    uuid: string;
    name: string;
    material: string;
    price: number;
    currency: string;
    pictureUrl: string;
}

/** Returns the demo items when the store is still empty, otherwise the current items */
export function seedOnce<T extends StoredItem>(aCurrent: T[], aDemo: readonly T[]): T[] {
    return aCurrent.length === 0 ? [...aDemo] : aCurrent;
}

/** Inserts an item at the front, removes any existing entry with the same uuid, trims to maxSize. */
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
