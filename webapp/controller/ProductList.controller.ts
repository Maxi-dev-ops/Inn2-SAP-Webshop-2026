import Controller from "sap/ui/core/mvc/Controller";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Sorter from "sap/ui/model/Sorter";
import ListBinding from "sap/ui/model/ListBinding";
import UIComponent from "sap/ui/core/UIComponent";
import MessageToast from "sap/m/MessageToast";
import Log from "sap/base/Log";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import HBox from "sap/m/HBox";
import Text from "sap/m/Text";
import List from "sap/m/List";
import Input from "sap/m/Input";
import SearchField from "sap/m/SearchField";
import CheckBox from "sap/m/CheckBox";
import Select from "sap/m/Select";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import formatter from "../model/formatter";

interface CartItemLite {
    uuid: string;
    name: string;
    material: string;
    price: number;
    currency: string;
    pictureUrl: string;
    quantity: number;
}

interface CatalogItemData {
    CatalogItemUuid: string;
    ProductName: string;
    Material: string;
    NetPriceAmount: number;
    TransactionCurrency: string;
    ProductPictureUrl: string;
}

export default class ProductListController extends Controller {
    public readonly formatter = formatter;

    private _searchQuery: string = "";
    private _catalogFilter: string = "";
    private _activeChip: Button | null = null;
    private _priceMin: number = 0;
    private _priceMax: number = Number.POSITIVE_INFINITY;
    private _onlyPriced: boolean = false;

    // -- Lifecycle --

    public onInit(): void {
        // "Alle"-Button als initialer aktiver Chip merken
        this._activeChip = this.byId("btnAllCategories") as Button;

        this._loadCatalogFilter();

        // Bei jedem Zurücknavigieren Binding aktualisieren, damit die Liste nicht leer bleibt
        UIComponent.getRouterFor(this)
            .getRoute("RouteProductList")
            .attachPatternMatched(this._onRouteMatched.bind(this));
    }

    private _onRouteMatched(): void {
        const oBinding = (this.byId("productGrid") as List).getBinding("items") as ListBinding | undefined;
        if (oBinding && !oBinding.isSuspended()) {
            oBinding.refresh();
        }
    }

    /** Liest einen Text aus dem i18n-ResourceBundle, optional mit Platzhaltern {0}, {1}, … */
    private _getText(sKey: string, aArgs?: (string | number)[]): string {
        const oBundle = (this.getOwnerComponent().getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
        return oBundle.getText(sKey, aArgs);
    }

    // -- Katalog-Filterleiste --

    /** Lädt alle Kataloge aus /Catalog und rendert Chip-Buttons in der Filterleiste. */
    private _loadCatalogFilter(): void {
        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        if (!oModel) {return;}
        oModel.read("/Catalog", {
            urlParameters: { $orderby: "CatalogId asc" },
            success: (oData: { results: Array<{ CatalogUuid: string; Title: string; CatalogId: string }> }) => {
                const oCategoryBar = this.byId("categoryBar") as HBox;
                oData.results.forEach((oCatalog) => {
                    const sLabel = oCatalog.Title || this._getText("catalogFallback", [oCatalog.CatalogId]);
                    const oChip = new Button({
                        text: sLabel,
                        type: "Transparent",
                        press: (oEvt: Event) => {
                            this._onCatalogChipPress(oCatalog.CatalogUuid, oEvt.getSource() as Button);
                        }
                    });
                    oChip.addStyleClass("rsCategoryPill");
                    oCategoryBar.addItem(oChip);
                });
            }
        });
    }

    public onAllCatalogsPress(): void {
        this._catalogFilter = "";
        this._setActiveChip(this.byId("btnAllCategories") as Button);
        this._applyFilters();
    }

    private _onCatalogChipPress(sUuid: string, oBtn: Button): void {
        this._catalogFilter = sUuid;
        this._setActiveChip(oBtn);
        this._applyFilters();
    }

    /** Setzt CSS-Klassen für aktiven/inaktiven Chip-Zustand. */
    private _setActiveChip(oNewActive: Button): void {
        if (this._activeChip) {
            this._activeChip.removeStyleClass("rsCategoryPillActive");
        }
        oNewActive.addStyleClass("rsCategoryPillActive");
        this._activeChip = oNewActive;

        // Horizon-Fokusring durch Blur des DOM-Elements entfernen
        const oDom = oNewActive.getDomRef();
        if (oDom) {
            (oDom as HTMLElement).blur();
        }
    }

    // -- Suche --

    public onSearch(oEvent: Event): void {
        this._searchQuery = (oEvent.getParameter("query") as string) ?? "";
        this._applyFilters();
    }

    public onSearchLive(oEvent: Event): void {
        this._searchQuery = (oEvent.getParameter("newValue") as string) ?? "";
        this._applyFilters();
    }

    // -- Filter & Sortierung --

    public onPriceInputChange(): void {
        const sMin = (this.byId("priceMinInput") as Input).getValue().trim();
        const sMax = (this.byId("priceMaxInput") as Input).getValue().trim();
        const nMin = parseFloat(sMin);
        const nMax = parseFloat(sMax);
        this._priceMin = sMin === "" || isNaN(nMin) ? 0 : Math.max(0, nMin);
        this._priceMax = sMax === "" || isNaN(nMax) ? Number.POSITIVE_INFINITY : nMax;
        this._applyFilters();
    }

    public onTogglePriced(oEvent: Event): void {
        this._onlyPriced = (oEvent.getParameter("selected") as boolean) ?? false;
        this._applyFilters();
    }

    private _applyFilters(): void {
        const oBinding = (this.byId("productGrid") as List).getBinding("items") as ListBinding | undefined;
        if (!oBinding) {return;}
        const aFilters: Filter[] = [];

        if (this._searchQuery.trim()) {
            aFilters.push(
                new Filter({
                    filters: [
                        new Filter("ProductName", FilterOperator.Contains, this._searchQuery),
                        new Filter("Material", FilterOperator.Contains, this._searchQuery)
                    ],
                    and: false
                })
            );
        }

        if (this._catalogFilter) {
            aFilters.push(new Filter("CatalogUuid", FilterOperator.EQ, this._catalogFilter));
        }

        // Preisbereich (von/bis) — je nach gesetzten Grenzen
        const bHasMin = this._priceMin > 0;
        const bHasMax = isFinite(this._priceMax);
        if (bHasMin && bHasMax) {
            aFilters.push(new Filter("NetPriceAmount", FilterOperator.BT, this._priceMin, this._priceMax));
        } else if (bHasMin) {
            aFilters.push(new Filter("NetPriceAmount", FilterOperator.GE, this._priceMin));
        } else if (bHasMax) {
            aFilters.push(new Filter("NetPriceAmount", FilterOperator.LE, this._priceMax));
        }

        if (this._onlyPriced) {
            aFilters.push(new Filter("NetPriceAmount", FilterOperator.GT, 0));
        }

        oBinding.filter(aFilters);
    }

    public onSort(oEvent: Event): void {
        const sKey = (oEvent.getSource() as Select).getSelectedKey();
        const parts = sKey.split("-");
        const sPath = parts[0];
        const bDesc = parts[1] === "desc";
        const oSorter = new Sorter(sPath, bDesc);
        const oBinding = (this.byId("productGrid") as List).getBinding("items") as ListBinding | undefined;
        if (oBinding) {
            oBinding.sort(oSorter);
        }
    }

    public onResetFilters(): void {
        this._searchQuery = "";
        this._catalogFilter = "";
        this._priceMin = 0;
        this._priceMax = Number.POSITIVE_INFINITY;
        this._onlyPriced = false;

        const oBtnAll = this.byId("btnAllCategories") as Button;
        if (oBtnAll) {this._setActiveChip(oBtnAll);}

        // Suchfeld leeren
        (this.byId("searchField") as SearchField)?.setValue("");

        // Preisfelder und Checkbox zurücksetzen
        (this.byId("priceMinInput") as Input)?.setValue("");
        (this.byId("priceMaxInput") as Input)?.setValue("");
        (this.byId("cbOnlyPriced") as CheckBox)?.setSelected(false);

        // Sort-Select zurücksetzen
        (this.byId("sortSelect") as Select)?.setSelectedKey("ProductName-asc");

        // Filter UND Sortierung aus der Binding entfernen
        const oBinding = (this.byId("productGrid") as List).getBinding("items") as ListBinding | undefined;
        if (oBinding) {
            oBinding.filter([]);
            oBinding.sort(new Sorter("ProductName", false));
        }
    }

    // -- Ergebnis-Anzeige --

    public onListUpdateFinished(oEvent: Event): void {
        const nTotal = oEvent.getParameter("total") as number;
        const oText = this.byId("resultCountText") as Text;
        if (oText) {
            oText.setText(this._getText(nTotal === 1 ? "resultCountOne" : "resultCountMany", [nTotal]));
        }
    }

    // -- Navigation --

    public onNavHome(): void {
        UIComponent.getRouterFor(this).navTo("RouteHome");
    }

    public onNavToCart(): void {
        UIComponent.getRouterFor(this).navTo("RouteCart");
    }

    public onProductPress(oEvent: Event): void {
        const oCtx = (oEvent.getSource() as Control).getBindingContext();
        if (!oCtx) {return;}
        const oData = oCtx.getObject() as { CatalogItemUuid: string };

        UIComponent.getRouterFor(this).navTo("RouteProductDetail", {
            catalogItemUuid: oData.CatalogItemUuid
        });
    }

    // -- Warenkorb --

    public onAddToCart(oEvent: Event): void {
        const oBtn = oEvent.getSource() as Button;
        const oCtx = oBtn.getBindingContext();
        if (!oCtx) {return;}
        const oData = oCtx.getObject() as CatalogItemData;

        oBtn.setBusy(true);

        const oModel = this.getOwnerComponent().getModel() as ODataModel;

        oModel.callFunction("/addToShoppingCart", {
            method: "POST",
            urlParameters: { CatalogItemUuid: oData.CatalogItemUuid },
            success: () => {
                oBtn.setBusy(false);
                const oCartModel = this.getOwnerComponent().getModel("cartModel") as JSONModel;
                const aItems = oCartModel.getProperty("/items") as CartItemLite[];
                const oExisting = aItems.find((i) => i.uuid === oData.CatalogItemUuid);
                if (oExisting) {
                    oExisting.quantity += 1;
                    oCartModel.setProperty("/items", aItems);
                } else {
                    aItems.push({
                        uuid: oData.CatalogItemUuid,
                        name: oData.ProductName,
                        material: oData.Material,
                        price: oData.NetPriceAmount,
                        currency: oData.TransactionCurrency,
                        pictureUrl: oData.ProductPictureUrl,
                        quantity: 1
                    });
                    oCartModel.setProperty("/items", aItems);
                }
                oCartModel.setProperty("/count", aItems.reduce((s, i) => s + i.quantity, 0));
                MessageToast.show(this._getText("addedToCart", [oData.ProductName]));
            },
            error: (oErr: unknown) => {
                oBtn.setBusy(false);
                const sResp = (oErr as { responseText?: string })?.responseText ?? "";
                Log.error("addToShoppingCart error", sResp);
                let sMsg = this._getText("addToCartError");
                try {
                    const oResp = JSON.parse(sResp) as { error?: { message?: { value?: string } } };
                    sMsg = oResp?.error?.message?.value ?? sMsg;
                } catch {
                    const oMatch = sResp.match(/<message[^>]*>([^<]+)<\/message>/i);
                    if (oMatch?.[1]) {sMsg = oMatch[1];}
                }
                MessageToast.show(sMsg);
            }
        });
    }

    // -- Bilder --

    /** Versteckt das img-Element bei Ladefehler → CSS-Platzhalter sichtbar. */
    public onImageError(oEvent: Event): void {
        (oEvent.getSource() as Control).addStyleClass("webshopImageBroken");
    }

    // -- Stub-Handler (für künftige Erweiterungen) --

    public onDownload(): void {
        MessageToast.show(this._getText("downloadUnavailable"));
    }
}
