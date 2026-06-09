import Controller from "sap/ui/core/mvc/Controller";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import UIComponent from "sap/ui/core/UIComponent";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import formatter from "../model/formatter";

interface HomeCategory {
    uuid: string;
    title: string;
}

interface HomeProduct {
    uuid: string;
    name: string;
    material: string;
    price: number;
    currency: string;
    pictureUrl: string;
}

/** OData-Rohzeilen (nur die per $select/Default gelesenen Felder). */
interface RawCatalog {
    CatalogUuid?: string;
    Title?: string;
    CatalogId?: string;
}

interface RawCatalogItem {
    CatalogItemUuid?: string;
    ProductName?: string;
    Material?: string;
    NetPriceAmount?: string;
    TransactionCurrency?: string;
    ProductPictureUrl?: string;
}

export default class HomeController extends Controller {
    public readonly formatter = formatter;

    public onInit(): void {
        const oHomeModel = new JSONModel({ categories: [], featured: [] });
        this.getView().setModel(oHomeModel, "home");
        this._loadCategories();
        this._loadFeatured();
    }

    private _getHomeModel(): JSONModel {
        return this.getView().getModel("home") as JSONModel;
    }

    /** Liest einen Text aus dem i18n-ResourceBundle, optional mit Platzhaltern {0}, {1}, … */
    private _getText(sKey: string, aArgs?: (string | number)[]): string {
        const oBundle = (this.getOwnerComponent().getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
        return oBundle.getText(sKey, aArgs);
    }

    private _loadCategories(): void {
        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        if (!oModel) {return;}
        oModel.read("/Catalog", {
            urlParameters: { $orderby: "CatalogId asc" },
            success: (oData: { results?: RawCatalog[] }) => {
                const aCats: HomeCategory[] = (oData.results ?? []).map((c) => ({
                    uuid: c.CatalogUuid ?? "",
                    title: c.Title || this._getText("catalogFallback", [c.CatalogId ?? ""])
                }));
                this._getHomeModel().setProperty("/categories", aCats);
            }
        });
    }

    private _loadFeatured(): void {
        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        if (!oModel) {return;}
        oModel.read("/CatalogItem", {
            urlParameters: { $top: "8", $orderby: "ProductName asc" },
            success: (oData: { results?: RawCatalogItem[] }) => {
                const aItems: HomeProduct[] = (oData.results ?? []).map((r) => ({
                    uuid: r.CatalogItemUuid ?? "",
                    name: r.ProductName ?? "",
                    material: r.Material ?? "",
                    price: parseFloat(r.NetPriceAmount ?? "0"),
                    currency: r.TransactionCurrency ?? "EUR",
                    pictureUrl: r.ProductPictureUrl ?? ""
                }));
                this._getHomeModel().setProperty("/featured", aItems);
            }
        });
    }

    // -- Navigation --

    public onProductPress(oEvent: Event): void {
        const oCtx = (oEvent.getSource() as Control).getBindingContext("home");
        if (!oCtx) {return;}
        UIComponent.getRouterFor(this).navTo("RouteProductDetail", {
            catalogItemUuid: oCtx.getProperty("uuid") as string
        });
    }

    public onCategoryPress(): void {
        UIComponent.getRouterFor(this).navTo("RouteProductList");
    }

    public onExplore(): void {
        UIComponent.getRouterFor(this).navTo("RouteProductList");
    }

    public onSearch(): void {
        UIComponent.getRouterFor(this).navTo("RouteProductList");
    }

    public onNavHome(): void {
        UIComponent.getRouterFor(this).navTo("RouteHome");
    }

    public onNavToCart(): void {
        UIComponent.getRouterFor(this).navTo("RouteCart");
    }

    // -- Bilder --

    public onImageError(oEvent: Event): void {
        (oEvent.getSource() as Control).addStyleClass("webshopImageBroken");
    }
}
