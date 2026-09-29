import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import UIComponent from "sap/ui/core/UIComponent";
import Log from "sap/base/Log";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Constants from "./Constants";
import { errText, readList } from "./odata";
import { isGuid } from "./validation";

export interface CatalogEntry {
    CatalogUuid: string;
    Title: string;
    CatalogId: string;
}

// Anything keyed by CatalogItemUuid that carries a price the catalog has
export interface PricedItem {
    uuid: string;
    price: number;
    currency: string;
}

interface RawPrice {
    CatalogItemUuid?: string;
    NetPriceAmount?: string;
    TransactionCurrency?: string;
}

// Single owner of the /Catalog request
export default class CatalogService {
    private static _pLoad: Promise<CatalogEntry[]> | undefined;

    public static load(oComponent: UIComponent): Promise<CatalogEntry[]> {
        const oCache = oComponent.getModel(Constants.MODELS.CATALOG) as JSONModel | undefined;
        if (oCache?.getProperty("/loaded") === true) {
            return Promise.resolve((oCache.getProperty("/results") as CatalogEntry[] | undefined) ?? []);
        }
        if (CatalogService._pLoad) {
            return CatalogService._pLoad;
        }

        const oModel = oComponent.getModel() as ODataModel | null;
        if (!oModel) {
            return Promise.resolve([]);
        }

        CatalogService._pLoad = readList<CatalogEntry>(oModel, Constants.ODATA.ENTITY_CATALOG, {
            $orderby: "CatalogId asc",
            $select: Constants.ODATA.SELECT_CATALOG
        }).then((aResults) => {
            oCache?.setProperty("/results", aResults);
            oCache?.setProperty("/loaded", true);
            return aResults;
        }, (oErr: unknown) => {
            // Do not cache the failure. Next page entry may retry
            CatalogService._pLoad = undefined;
            Log.warning("Catalog load failed.", errText(oErr));
            throw oErr;
        });

        return CatalogService._pLoad;
    }

    // Fills in the prices of items that came back from browser storage
    public static withPrices<T extends PricedItem>(oComponent: UIComponent, aItems: T[]): Promise<T[]> {
        const aUuids = [...new Set(aItems.map((i) => i.uuid))].filter(isGuid);
        const oModel = oComponent.getModel() as ODataModel | null;
        if (!oModel || !aUuids.length) {return Promise.resolve(aItems);}

        return readList<RawPrice>(oModel, Constants.ODATA.ENTITY_CATALOG_ITEM, {
            $top: String(aUuids.length),
            $select: "CatalogItemUuid,NetPriceAmount,TransactionCurrency"
        }, [new Filter({
            filters: aUuids.map((s) => new Filter("CatalogItemUuid", FilterOperator.EQ, s)),
            and: false
        })]).then((aRows) => {
            const mPrices = new Map(aRows.map((r) => [r.CatalogItemUuid ?? "", r]));
            return aItems.map((oItem) => {
                const oHit = mPrices.get(oItem.uuid);
                if (!oHit) {return oItem;}
                return {
                    ...oItem,
                    price: parseFloat(String(oHit.NetPriceAmount ?? "0")) || 0,
                    currency: oHit.TransactionCurrency ?? "EUR"
                };
            });
        }, (oErr: unknown) => {
            // Without a price the card says "price on request"
            Log.warning("Prices for stored items not available.", errText(oErr));
            return aItems;
        });
    }
}
