import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import Filter from "sap/ui/model/Filter";

/**
 * The OData V2 model reports every call through callbacks, so the wrapping lives here once
 */

// Raw response body of an OData V2 error
export function errText(oErr: unknown): string {
    return (oErr as { responseText?: string })?.responseText ?? "";
}

// Readable message out of an OData V2 error, falls back when there is none
export function extractODataError(oErr: unknown, sFallback: string): string {
    const sResp = errText(oErr);
    if (!sResp) {return sFallback;}
    try {
        const oResp = JSON.parse(sResp) as { error?: { message?: { value?: string } } };
        return oResp?.error?.message?.value ?? sFallback;
    } catch {
        return sResp.match(/<message[^>]*>([^<]+)<\/message>/i)?.[1] ?? sFallback;
    }
}

// GET of a single entity or of an expanded structure
export function readOnce<T>(
    oModel: ODataModel, sPath: string, mUrlParameters: Record<string, string>, aFilters?: Filter[]
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        oModel.read(sPath, {
            urlParameters: mUrlParameters,
            filters: aFilters,
            success: (oData: unknown) => { resolve(oData as T); },
            error: reject
        });
    });
}

// GET of a collection, an empty answer resolves with an empty list
export function readList<T>(
    oModel: ODataModel, sPath: string, mUrlParameters: Record<string, string>, aFilters?: Filter[]
): Promise<T[]> {
    return readOnce<{ results?: T[] }>(oModel, sPath, mUrlParameters, aFilters).then((oData) => oData.results ?? []);
}

// POST of a FunctionImport
export function callOnce(oModel: ODataModel, sFunction: string, mUrlParameters: Record<string, string>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        oModel.callFunction(sFunction, {
            method: "POST",
            urlParameters: mUrlParameters,
            success: () => { resolve(); },
            error: reject
        });
    });
}

// MERGE of the given fields onto an existing entity
export function updateOnce(oModel: ODataModel, sPath: string, oPayload: object): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        oModel.update(sPath, oPayload, { success: () => { resolve(); }, error: reject });
    });
}

// DELETE of a single entity
export function removeOnce(oModel: ODataModel, sPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        oModel.remove(sPath, { success: () => { resolve(); }, error: reject });
    });
}
