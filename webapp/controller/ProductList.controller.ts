import Controller from "sap/ui/core/mvc/Controller";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Sorter from "sap/ui/model/Sorter";
import UIComponent from "sap/ui/core/UIComponent";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import Button from "sap/m/Button";
import HBox from "sap/m/HBox";
import Text from "sap/m/Text";
import formatter from "../model/formatter";

export default class ProductListController extends Controller {
    public readonly formatter = formatter;

    private _searchQuery: string = "";
    private _catalogFilter: string = "";
    private _activeChip: Button | null = null;

    // ─── Lifecycle ─────────────────────────────────────────────────────────────

    public onInit(): void {
        // Warenkorb-Modell (session-lokal, persistiert über Navigation)
        if (!this.getOwnerComponent()!.getModel("cartModel")) {
            const oCartModel = new JSONModel({ count: 0 });
            this.getOwnerComponent()!.setModel(oCartModel, "cartModel");
        }

        // "Alle"-Button als initialer aktiver Chip merken
        this._activeChip = this.byId("btnAllCategories") as Button;

        this._loadCatalogFilter();

        // Bei jedem Zurücknavigieren Binding aktualisieren, damit die Liste nicht leer bleibt
        UIComponent.getRouterFor(this)
            .getRoute("RouteProductList")!
            .attachPatternMatched(this._onRouteMatched, this);
    }

    private _onRouteMatched(): void {
        const oBinding = (this.byId("productGrid") as any)?.getBinding("items");
        if (oBinding && !oBinding.isSuspended()) {
            oBinding.refresh();
        }
    }

    // ─── Katalog-Filterleiste ──────────────────────────────────────────────────

    /**
     * Lädt alle Kataloge aus /Catalog und rendert Chip-Buttons in der Filterleiste.
     */
    private _loadCatalogFilter(): void {
        const oModel = this.getOwnerComponent()!.getModel() as ODataModel;
        if (!oModel) return;
        oModel.read("/Catalog", {
            urlParameters: { $orderby: "CatalogId asc" },
            success: (oData: { results: Array<{ CatalogUuid: string; Title: string; CatalogId: string }> }) => {
                const oCategoryBar = this.byId("categoryBar") as HBox;
                oData.results.forEach((oCatalog) => {
                    const sLabel = oCatalog.Title || `Katalog ${oCatalog.CatalogId}`;
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
    }

    // ─── Suche ─────────────────────────────────────────────────────────────────

    public onSearch(oEvent: Event): void {
        this._searchQuery = (oEvent.getParameter("query") as string) ?? "";
        this._applyFilters();
    }

    public onSearchLive(oEvent: Event): void {
        this._searchQuery = (oEvent.getParameter("newValue") as string) ?? "";
        this._applyFilters();
    }

    // ─── Filter & Sortierung ───────────────────────────────────────────────────

    private _applyFilters(): void {
        const oBinding = (this.byId("productGrid") as any).getBinding("items");
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

        oBinding.filter(aFilters);
    }

    public onSort(oEvent: Event): void {
        const sKey = (oEvent.getSource() as any).getSelectedKey() as string;
        const parts = sKey.split("-");
        const sPath = parts[0];
        const bDesc = parts[1] === "desc";
        const oSorter = new Sorter(sPath, bDesc);
        const oBinding = (this.byId("productGrid") as any).getBinding("items");
        oBinding.sort(oSorter);
    }

    public onResetFilters(): void {
        this._searchQuery = "";
        this._catalogFilter = "";

        const oBtnAll = this.byId("btnAllCategories") as Button;
        if (oBtnAll) this._setActiveChip(oBtnAll);

        // Suchfeld leeren
        const oSearch = this.byId("searchField") as any;
        if (oSearch) oSearch.setValue("");

        // Sort-Select zurücksetzen
        const oSortSelect = this.byId("sortSelect") as any;
        if (oSortSelect) oSortSelect.setSelectedKey("ProductName-asc");

        // Filter UND Sortierung aus der Binding entfernen
        const oBinding = (this.byId("productGrid") as any)?.getBinding("items");
        if (oBinding) {
            oBinding.filter(null);
            oBinding.sort(new Sorter("ProductName", false));
        }
    }

    // ─── Ergebnis-Anzeige ─────────────────────────────────────────────────────

    public onListUpdateFinished(oEvent: Event): void {
        const nTotal = oEvent.getParameter("total") as number;
        const oText = this.byId("resultCountText") as Text;
        if (oText) {
            oText.setText(`${nTotal} Produkt${nTotal !== 1 ? "e" : ""}`);
        }
    }

    // ─── Navigation ───────────────────────────────────────────────────────────

    public onNavHome(): void {
        UIComponent.getRouterFor(this).navTo("RouteProductList");
    }

    public onProductPress(oEvent: Event): void {
        const oItem = oEvent.getSource() as any;
        const oCtx = oItem.getBindingContext();
        if (!oCtx) return;
        const oData = oCtx.getObject() as { CatalogItemUuid: string };

        UIComponent.getRouterFor(this).navTo("RouteProductDetail", {
            catalogItemUuid: oData.CatalogItemUuid
        });
    }

    // ─── Warenkorb ─────────────────────────────────────────────────────────────

    public onAddToCart(oEvent: Event): void {
        const oBtn = oEvent.getSource() as any;
        const oCtx = oBtn.getBindingContext();
        if (!oCtx) return;
        const oData = oCtx.getObject() as { CatalogItemUuid: string; ProductName: string };

        oBtn.setBusy(true);

        // getOwnerComponent().getModel() — nicht getView().getModel()
        const oModel = this.getOwnerComponent()!.getModel() as ODataModel;

        oModel.callFunction("/addToShoppingCart", {
            method: "POST",
            urlParameters: { CatalogItemUuid: oData.CatalogItemUuid },
            success: () => {
                oBtn.setBusy(false);
                const oCartModel = this.getOwnerComponent()!.getModel("cartModel") as JSONModel;
                const nCount = (oCartModel.getProperty("/count") as number) + 1;
                oCartModel.setProperty("/count", nCount);
                MessageToast.show(`„${oData.ProductName}" wurde in den Warenkorb gelegt`);
            },
            error: () => {
                oBtn.setBusy(false);
                MessageToast.show("Fehler beim Hinzufügen zum Warenkorb");
            }
        });
    }

    // ─── Bilder ───────────────────────────────────────────────────────────────

    /** Versteckt das img-Element bei Ladefehler → CSS-Platzhalter sichtbar. */
    public onImageError(oEvent: Event): void {
        (oEvent.getSource() as any).addStyleClass("webshopImageBroken");
    }

    // ─── Stub-Handler (für künftige Erweiterungen) ────────────────────────────

    public onDownload(): void {
        MessageToast.show("Download nicht verfügbar");
    }
}
