import BaseController from "./BaseController";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Sorter from "sap/ui/model/Sorter";
import ListBinding from "sap/ui/model/ListBinding";
import MessageBox from "sap/m/MessageBox";
import Log from "sap/base/Log";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import { ValueState } from "sap/ui/core/library";
import Button from "sap/m/Button";
import HBox from "sap/m/HBox";
import Text from "sap/m/Text";
import List from "sap/m/List";
import Input from "sap/m/Input";
import SearchField, { type SearchField$SearchEvent, type SearchField$LiveChangeEvent } from "sap/m/SearchField";
import CheckBox, { type CheckBox$SelectEvent } from "sap/m/CheckBox";
import Select from "sap/m/Select";
import VBox from "sap/m/VBox";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import { type ListBase$UpdateFinishedEvent } from "sap/m/ListBase";
import { type Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import formatter from "../model/formatter";
import CartService, { CatalogProduct } from "../model/CartService";
import CatalogService, { CatalogEntry } from "../model/CatalogService";
import { WishlistItem } from "../model/WishlistService";
import { parseNumberInRange } from "../model/validation";
import { readOnce } from "../model/odata";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class ProductListController extends BaseController {
    public readonly formatter = formatter;

    private _cartService: CartService | undefined;
    private _oCartDialog: Dialog | undefined;
    private _searchQuery: string = "";
    private _catalogFilter: string = "";
    private _priceMin: number = 0;
    private _priceMax: number = Number.POSITIVE_INFINITY;
    private _onlyPriced: boolean = false;
    private _searchTimer: ReturnType<typeof setTimeout> | undefined;
    // XML item template, captured so the product list can be rebound from scratch
    private _oProductTemplate: Control | undefined;
    // Filter state the binding currently carries. Several controls ask the same list
    private _sAppliedFilter: string | undefined;

    // -- Lifecycle -- //

    public onInit(): void {
        this._cartService = new CartService(this.getOwnerComponent());

        const oCartDialogModel = new JSONModel({
            uuid: "", name: "", material: "", price: 0, currency: "EUR", pictureUrl: "", quantity: 1,
            description: "", hasDescription: false, bundleItems: [], hasBundleItems: false,
            busy: false, progress: ""
        });
        this.setModel(oCartDialogModel, "cartDialog");

        // Show All filter before catalog request returns
        const oViewModel = new JSONModel({ categoryChips: [{ uuid: "", title: this._getText("filterAll") }] });
        this.setModel(oViewModel, "plpView");

        this._loadCatalogFilter();

        this._attachRoute(Constants.ROUTES.PRODUCT_LIST, this._onRouteMatched.bind(this));
    }

    public onExit(): void {
        super.onExit();
        if (this._searchTimer !== undefined) {
            clearTimeout(this._searchTimer);
            this._searchTimer = undefined;
        }
        if (this._oCartDialog) {
            this._oCartDialog.destroy();
            this._oCartDialog = undefined;
        }
    }

    // -- Routing & product binding -- //

    private _onRouteMatched(oEvent: Route$PatternMatchedEvent): void {
        const oArgs = oEvent.getParameter("arguments") as { "?query"?: { query?: string; catalog?: string } } | undefined;
        const sQuery = oArgs?.["?query"]?.query ?? "";
        const sCatalogUuid = oArgs?.["?query"]?.catalog ?? "";

        // The hash is the whole truth on entry. What it does not name is not filtered
        this._searchQuery = sQuery;
        this._catalogFilter = sCatalogUuid;
        (this.byId("searchField") as SearchField)?.setValue(sQuery);

        this._syncProducts();
        this._highlightActiveChip();
    }

    // Binds on the first entry and after that only when the filter set changes
    private _syncProducts(): void {
        const oBinding = (this.byId("productGrid") as List).getBinding("items") as ListBinding | undefined;
        if (oBinding && this._sAppliedFilter === this._filterKey()) {return;}
        this._rebindProducts();
    }

    // binds the product grid from scratch with the current filters + sort order
    private _rebindProducts(): void {
        const oList = this.byId("productGrid") as List;
        if (!this._oProductTemplate) {
            const oInfo = oList.getBindingInfo("items") as { template?: Control; templateShareable?: boolean } | undefined;
            if (oInfo?.template) {
                oInfo.templateShareable = true; // keep the XML template alive across rebinds
                this._oProductTemplate = oInfo.template;
            }
        }
        if (!this._oProductTemplate) {
            // resume what the XML declared
            Log.error("Product list template missing - falling back to the declarative binding");
            (oList.getBinding("items") as ListBinding | undefined)?.resume();
            return;
        }

        this._sAppliedFilter = this._filterKey();
        oList.bindItems({
            path: Constants.ODATA.ENTITY_CATALOG_ITEM,
            template: this._oProductTemplate,
            templateShareable: true,
            parameters: { select: Constants.ODATA.SELECT_CATALOG_ITEM_CARD },
            filters: this._buildFilters(),
            sorter: this._currentSorter(),
            events: {
                dataReceived: (oEvt: Event<{ error?: unknown }>) => { this.onProductDataReceived(oEvt); }
            }
        });
    }

    private _currentSorter(): Sorter {
        const sKey = (this.byId("sortSelect") as Select | undefined)?.getSelectedKey() || "ProductName-asc";
        const aParts = sKey.split("-");
        return new Sorter(aParts[0], aParts[1] === "desc");
    }

    // -- Catalog filter bar -- //

    private _loadCatalogFilter(): void {
        CatalogService.load(this.getOwnerComponent())
            .then((aResults) => { this._setCatalogChips(aResults); })
            .catch(() => undefined); // CatalogService already logged it
    }

    // Fills the bound chip bar
    private _setCatalogChips(aResults: CatalogEntry[]): void {
        const aChips = [
            { uuid: "", title: this._getText("filterAll") },
            ...aResults.map((oCatalog) => ({
                uuid: oCatalog.CatalogUuid,
                title: oCatalog.Title || this._getText("catalogFallback", [oCatalog.CatalogId])
            }))
        ];
        this._json("plpView").setProperty("/categoryChips", aChips);
        this._highlightActiveChip();
    }

    public onCategoryChipPress(oEvent: Event<object, Control>): void {
        const oCtx = oEvent.getSource().getBindingContext("plpView");
        const sUuid = oCtx ? (oCtx.getProperty("uuid") as string) : "";
        if (sUuid === this._catalogFilter) {return;}

        // Goes through the hash instead of filtering in place
        const oParams: Record<string, string> = {};
        const sQuery = this._searchQuery.trim();
        if (sQuery) {oParams.query = sQuery;}
        if (sUuid) {oParams.catalog = sUuid;}
        this._navTo(Constants.ROUTES.PRODUCT_LIST, { "?query": oParams }, true);
    }

    // Reflects active catalog filter
    private _highlightActiveChip(): void {
        (this.byId("categoryBar") as HBox).getItems().forEach((oItem) => {
            const oBtn = oItem as Button;
            const oCtx = oBtn.getBindingContext("plpView");
            const sUuid = oCtx ? (oCtx.getProperty("uuid") as string) : "";
            oBtn.toggleStyleClass("rsCategoryPillActive", sUuid === this._catalogFilter);
        });
    }

    public onAfterRendering(): void {
        this._highlightActiveChip();
    }

    // -- Search -- //

    public onSearch(oEvent: SearchField$SearchEvent): void {
        this._searchQuery = (oEvent.getParameter("query") as string) ?? "";
        if (this._searchTimer !== undefined) {
            clearTimeout(this._searchTimer);
            this._searchTimer = undefined;
        }
        this._applyFilters();
    }

    public onSearchLive(oEvent: SearchField$LiveChangeEvent): void {
        this._searchQuery = (oEvent.getParameter("newValue") as string) ?? "";
        if (this._searchTimer !== undefined) {clearTimeout(this._searchTimer);}
        // eslint-disable-next-line @sap-ux/fiori-tools/sap-timeout-usage -- debounce
        this._searchTimer = setTimeout(() => {
            this._searchTimer = undefined;
            this._applyFilters();
        }, Constants.UI.SEARCH_DEBOUNCE_MS);
    }

    // -- Filter & sort -- //

    // A price the user typed
    private _priceBound(oInput: Input, nFallback: number): number | null {
        const sValue = oInput.getValue().trim();
        if (sValue === "") {return nFallback;}
        return parseNumberInRange(sValue, 0, Constants.UI.PRICE_FILTER_MAX);
    }

    public onPriceInputChange(): void {
        const oMinInput = this.byId("priceMinInput") as Input;
        const oMaxInput = this.byId("priceMaxInput") as Input;
        const nMin = this._priceBound(oMinInput, 0);
        const nMax = this._priceBound(oMaxInput, Number.POSITIVE_INFINITY);

        // Unusable input or an inverted range
        const bBadRange = nMin !== null && nMax !== null && isFinite(nMax) && nMin > nMax;
        const sMsg = this._getText(bBadRange ? "priceRangeInvalid" : "priceValueInvalid");
        const mark = (oInput: Input, bError: boolean): void => {
            oInput.setValueState(bError ? ValueState.Error : ValueState.None);
            if (bError) {oInput.setValueStateText(sMsg);}
        };
        mark(oMinInput, nMin === null || bBadRange);
        mark(oMaxInput, nMax === null || bBadRange);
        if (nMin === null || nMax === null || bBadRange) {return;}

        this._priceMin = nMin;
        this._priceMax = nMax;
        this._applyFilters();
    }

    public onTogglePriced(oEvent: CheckBox$SelectEvent): void {
        this._onlyPriced = (oEvent.getParameter("selected") as boolean) ?? false;
        this._applyFilters();
    }

    // Everything the current filter set consists of
    private _filterKey(): string {
        return JSON.stringify([
            this._searchQuery.trim(), this._catalogFilter, this._priceMin, this._priceMax, this._onlyPriced
        ]);
    }

    private _applyFilters(): void {
        const oBinding = (this.byId("productGrid") as List).getBinding("items") as ListBinding | undefined;
        if (!oBinding) {return;}
        const sKey = this._filterKey();
        if (sKey === this._sAppliedFilter) {return;}
        this._sAppliedFilter = sKey;
        oBinding.filter(this._buildFilters());
    }

    // Builds the active OData filters
    private _buildFilters(): Filter[] {
        const aFilters: Filter[] = [];

        const sQuery = this._searchQuery.trim();
        if (sQuery) {
            aFilters.push(
                new Filter({
                    filters: [
                        new Filter("ProductName", FilterOperator.Contains, sQuery),
                        new Filter("Material", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                })
            );
        }

        if (this._catalogFilter) {
            aFilters.push(new Filter("CatalogUuid", FilterOperator.EQ, this._catalogFilter));
        }

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

        return aFilters;
    }

    public onSort(): void {
        const oBinding = (this.byId("productGrid") as List).getBinding("items") as ListBinding | undefined;
        if (oBinding) {
            oBinding.sort(this._currentSorter());
        }
    }

    public onResetFilters(): void {
        this._searchQuery = "";
        this._catalogFilter = "";
        this._priceMin = 0;
        this._priceMax = Number.POSITIVE_INFINITY;
        this._onlyPriced = false;

        this._highlightActiveChip();

        (this.byId("searchField") as SearchField)?.setValue("");
        (this.byId("priceMinInput") as Input)?.setValue("");
        (this.byId("priceMinInput") as Input)?.setValueState(ValueState.None);
        (this.byId("priceMaxInput") as Input)?.setValue("");
        (this.byId("priceMaxInput") as Input)?.setValueState(ValueState.None);
        (this.byId("cbOnlyPriced") as CheckBox)?.setSelected(false);
        (this.byId("sortSelect") as Select)?.setSelectedKey("ProductName-asc");

        // Clears the hash too, otherwise the next entry would filter by a catalog the user just
        // reset away. When the hash was already bare the route does not fire, so _syncProducts()
        // does the rebind; when it does fire, it is already done and the call below is a no-op.
        this._navTo(Constants.ROUTES.PRODUCT_LIST, {}, true);
        this._syncProducts();
    }

    public onProductDataReceived(oEvent: Event<{error?: unknown}>): void {
        const oError = oEvent.getParameter("error");
        if (oError) {
            this._reportError(oError, "productsLoadError", "CatalogItem list load failed");
        }
    }

    public onListUpdateFinished(oEvent: ListBase$UpdateFinishedEvent): void {
        const nTotal = oEvent.getParameter("total") as number;
        const oText = this.byId("resultCountText") as Text;
        if (oText) {
            oText.setText(this._getText(nTotal === 1 ? "resultCountOne" : "resultCountMany", [nTotal]));
        }

        const bHasFilters = !!(
            this._searchQuery.trim() ||
            this._catalogFilter ||
            this._priceMin > 0 ||
            isFinite(this._priceMax) ||
            this._onlyPriced
        );
        const bShowCustomEmpty = bHasFilters && nTotal === 0;
        const oEmpty = this.byId("emptyResultState") as VBox;
        if (oEmpty) {oEmpty.setVisible(bShowCustomEmpty);}
        (this.byId("productGrid") as List).setShowNoData(!bShowCustomEmpty);
        this._updateHeartIcons(this.byId("productGrid") as List, undefined, "CatalogItemUuid");
    }

    // -- Navigation -- //

    public onProductPress(oEvent: Event<object, Control>): void {
        const oData = this._ctxObject<{ CatalogItemUuid: string }>(oEvent);
        if (!oData) {return;}
        this._navTo(Constants.ROUTES.PRODUCT_DETAIL, { catalogItemUuid: oData.CatalogItemUuid });
    }

    // -- Cart dialog -- //

    private _getCartDialog(): Promise<Dialog> {
        if (this._oCartDialog) {
            return Promise.resolve(this._oCartDialog);
        }
        return Fragment.load({
            id: this.getView()!.getId(),
            name: "com.sapwebshop2026.sapwebshop.view.AddToCartDialog",
            controller: this
        }).then((oControl) => {
            this._oCartDialog = oControl as Dialog;
            this.getView()!.addDependent(this._oCartDialog);
            return this._oCartDialog;
        }).catch((oErr: unknown) => {
            Log.error("AddToCartDialog Fragment.load failed", String(oErr));
            throw oErr;
        });
    }

    public onOpenCartDialog(oEvent: Event<object, Control>): void {
        const oData = this._ctxObject<CatalogProduct>(oEvent);
        if (!oData) {return;}

        const oModel = this._json("cartDialog");
        oModel.setData({
            uuid: oData.CatalogItemUuid,
            name: oData.ProductName,
            material: oData.Material,
            price: CartService.toNum(oData.NetPriceAmount),
            currency: oData.TransactionCurrency,
            pictureUrl: oData.ProductPictureUrl,
            quantity: Constants.UI.STEP_INPUT_MIN,
            description: "",
            hasDescription: false,
            bundleItems: [],
            hasBundleItems: false,
            busy: false,
            progress: ""
        });

        this._loadDialogDetails(oData.CatalogItemUuid);

        void this._getCartDialog()
            .then((oDialog) => oDialog.open())
            .catch(() => MessageBox.error(this._getText("addToCartError")));
    }

    private _loadDialogDetails(sUuid: string): void {
        const oODataModel = this.getOwnerComponent().getModel() as ODataModel;
        const oDialogModel = this._json("cartDialog");

        readOnce<{
            ProductSalesDescription?: string;
            to_BundleItem?: { results?: Array<Record<string, unknown>> };
        }>(oODataModel, `${Constants.ODATA.ENTITY_CATALOG_ITEM}(guid'${sUuid}')`, {
            $expand: "to_BundleItem",
            $select: "CatalogItemUuid,ProductSalesDescription,to_BundleItem/BillOfMaterialComponent,to_BundleItem/ComponentDescription,to_BundleItem/BOMItemDescription"
        }).then((oData) => {
            // The user may have opened the next dialog while this was in flight
            if (oDialogModel.getProperty("/uuid") !== sUuid) {return;}

            const sDesc = (oData.ProductSalesDescription ?? "").trim();
            const aBundle = (oData.to_BundleItem?.results ?? [])
                .map((r) => {
                    const sText = [r.ComponentDescription, r.BOMItemDescription, r.BillOfMaterialComponent]
                        .map((v) => (typeof v === "string" ? v.trim() : ""))
                        .find((v) => v.length > 0) ?? "";
                    return { text: sText };
                })
                .filter((b) => b.text);

            oDialogModel.setProperty("/description", sDesc);
            oDialogModel.setProperty("/hasDescription", !!sDesc);
            oDialogModel.setProperty("/bundleItems", aBundle);
            oDialogModel.setProperty("/hasBundleItems", aBundle.length > 0);
        }, (oErr: unknown) => {
            Log.warning("Dialog details load failed.", String(oErr));
        });
    }

    public onConfirmAddToCart(): void {
        const oModel = this._json("cartDialog");
        const oProduct: CatalogProduct = {
            CatalogItemUuid: oModel.getProperty("/uuid") as string,
            ProductName: oModel.getProperty("/name") as string,
            Material: oModel.getProperty("/material") as string,
            NetPriceAmount: oModel.getProperty("/price") as number,
            TransactionCurrency: oModel.getProperty("/currency") as string,
            ProductPictureUrl: oModel.getProperty("/pictureUrl") as string
        };

        if (!this._cartService) {return;}
        // A busy overlay would hide the progress line, dialog only locks its controls
        this._addToCart(
            this._cartService, oProduct, oModel.getProperty("/quantity") as number,
            (bBusy, sProgress) => {
                oModel.setProperty("/busy", bBusy);
                oModel.setProperty("/progress", sProgress);
            },
            () => this._oCartDialog?.close()
        );
    }

    public onCancelCartDialog(): void {
        this._oCartDialog?.close();
    }

    // -- Wishlist -- //

    public onToggleWishlist(oEvent: Event<object, Button>): void {
        const oBtn = oEvent.getSource();
        const oData = this._ctxObject<CatalogProduct>(oEvent);
        if (!oData) {return;}

        const oItem: WishlistItem = {
            uuid: oData.CatalogItemUuid,
            name: oData.ProductName,
            material: oData.Material,
            price: CartService.toNum(oData.NetPriceAmount),
            currency: oData.TransactionCurrency,
            pictureUrl: oData.ProductPictureUrl
        };
        this._toggleWishlistFromContext(oBtn, oItem, oData.ProductName);
    }
}
