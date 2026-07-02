import BaseController from "./BaseController";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Sorter from "sap/ui/model/Sorter";
import ListBinding from "sap/ui/model/ListBinding";
import UIComponent from "sap/ui/core/UIComponent";
import MessageToast from "sap/m/MessageToast";
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
import { WishlistItem } from "../model/WishlistService";
import Constants from "../model/Constants";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class ProductListController extends BaseController {
    public readonly formatter = formatter;

    private _cartService: CartService | undefined;
    private _oCartDialog: Dialog | undefined;
    private _searchQuery: string = "";
    /** true when _searchQuery came from a ?query= nav param; auto-resets on the next plain route match. */
    private _searchFromNav: boolean = false;
    private _catalogFilter: string = "";
    private _priceMin: number = 0;
    private _priceMax: number = Number.POSITIVE_INFINITY;
    private _onlyPriced: boolean = false;
    /** XML item template, captured so the product list can be rebound from scratch (see _rebindProducts). */
    private _oProductTemplate: Control | undefined;

    // -- Lifecycle --

    public onInit(): void {
        this._cartService = new CartService(this.getOwnerComponent());

        const oCartDialogModel = new JSONModel({
            uuid: "", name: "", material: "", price: 0, currency: "EUR", pictureUrl: "", quantity: 1,
            description: "", hasDescription: false, bundleItems: [], hasBundleItems: false
        });
        this.setModel(oCartDialogModel, "cartDialog");

        // Seed the "All" chip so it shows before the catalog request returns.
        const oViewModel = new JSONModel({ categoryChips: [{ uuid: "", title: this._getText("filterAll") }] });
        this.setModel(oViewModel, "plpView");

        this._loadCatalogFilter();

        this._attachRoute(Constants.ROUTES.PRODUCT_LIST, this._onRouteMatched.bind(this));
    }

    public onExit(): void {
        super.onExit();
        if (this._oCartDialog) {
            this._oCartDialog.destroy();
            this._oCartDialog = undefined;
        }
    }

    // -- Routing & product binding --

    private _onRouteMatched(oEvent: Route$PatternMatchedEvent): void {
        const oArgs = oEvent.getParameter("arguments") as { "?query"?: { query?: string; catalog?: string } } | undefined;
        const sQuery = oArgs?.["?query"]?.query ?? "";
        const sCatalogUuid = oArgs?.["?query"]?.catalog ?? "";

        if (sQuery) {
            this._searchQuery = sQuery;
            this._searchFromNav = true;
            (this.byId("searchField") as SearchField)?.setValue(sQuery);
        } else if (sCatalogUuid) {
            this._catalogFilter = sCatalogUuid;
        } else if (this._searchFromNav) {
            this._searchQuery = "";
            this._searchFromNav = false;
            (this.byId("searchField") as SearchField)?.setValue("");
        }

        // Rebind from scratch on every entry: with view caching, a binding that first fired
        // before the SAP session was active stays stuck at "0 / done" and refresh() won't revive it.
        this._rebindProducts();
        this._highlightActiveChip();
    }

    /** (Re)binds the product grid from scratch with the current filters + sort order.
     *  Replaces a potentially stuck declarative binding (see _onRouteMatched). */
    private _rebindProducts(): void {
        const oList = this.byId("productGrid") as List;
        if (!this._oProductTemplate) {
            const oInfo = oList.getBindingInfo("items") as { template?: Control; templateShareable?: boolean } | undefined;
            if (oInfo?.template) {
                oInfo.templateShareable = true; // keep the XML template alive across rebinds
                this._oProductTemplate = oInfo.template;
            }
        }
        if (!this._oProductTemplate) { return; }

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

    // -- Catalog filter bar --

    private _loadCatalogFilter(): void {
        const oCatalogCache = this.getOwnerComponent().getModel(Constants.MODELS.CATALOG) as JSONModel | undefined;
        if (oCatalogCache?.getProperty("/loaded") === true) {
            const aResults = oCatalogCache.getProperty("/results") as Array<{ CatalogUuid: string; Title: string; CatalogId: string }>;
            this._setCatalogChips(aResults);
            return;
        }
        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        if (!oModel) {return;}
        oModel.read(Constants.ODATA.ENTITY_CATALOG, {
            urlParameters: {
                $orderby: "CatalogId asc",
                $select: Constants.ODATA.SELECT_CATALOG
            },
            success: (oData: { results: Array<{ CatalogUuid: string; Title: string; CatalogId: string }> }) => {
                const aResults = oData.results ?? [];
                this._setCatalogChips(aResults);
                oCatalogCache?.setProperty("/results", aResults);
                oCatalogCache?.setProperty("/loaded", true);
            },
            error: (oErr: unknown) => {
                Log.warning("Catalog filter load failed.", this._errText(oErr));
            }
        });
    }

    /** Fills the declaratively bound chip bar; the first entry ("All") clears the catalog filter. */
    private _setCatalogChips(aResults: Array<{ CatalogUuid: string; Title: string; CatalogId: string }>): void {
        const aChips = [
            { uuid: "", title: this._getText("filterAll") },
            ...aResults.map((oCatalog) => ({
                uuid: oCatalog.CatalogUuid,
                title: oCatalog.Title || this._getText("catalogFallback", [oCatalog.CatalogId])
            }))
        ];
        (this.getModel("plpView") as JSONModel).setProperty("/categoryChips", aChips);
        this._highlightActiveChip();
    }

    public onCategoryChipPress(oEvent: Event<object, Control>): void {
        const oCtx = oEvent.getSource().getBindingContext("plpView");
        this._catalogFilter = oCtx ? (oCtx.getProperty("uuid") as string) : "";
        this._highlightActiveChip();
        this._applyFilters();
    }

    /** Reflects the current catalog filter on the chips. */
    private _highlightActiveChip(): void {
        (this.byId("categoryBar") as HBox).getItems().forEach((oItem) => {
            const oBtn = oItem as Button;
            const oCtx = oBtn.getBindingContext("plpView");
            const sUuid = oCtx ? (oCtx.getProperty("uuid") as string) : "";
            oBtn.toggleStyleClass("rsCategoryPillActive", sUuid === this._catalogFilter);
        });
    }

    public onAfterRendering(): void {
        // Re-apply after async chip load / cached-view re-render on back navigation.
        this._highlightActiveChip();
    }

    // -- Search --

    public onSearch(oEvent: SearchField$SearchEvent): void {
        this._searchQuery = (oEvent.getParameter("query") as string) ?? "";
        this._searchFromNav = false;
        this._applyFilters();
    }

    public onSearchLive(oEvent: SearchField$LiveChangeEvent): void {
        this._searchQuery = (oEvent.getParameter("newValue") as string) ?? "";
        this._searchFromNav = false;
        this._applyFilters();
    }

    // -- Filter & sort --

    public onPriceInputChange(): void {
        const oMinInput = this.byId("priceMinInput") as Input;
        const oMaxInput = this.byId("priceMaxInput") as Input;
        const sMin = oMinInput.getValue().trim();
        const sMax = oMaxInput.getValue().trim();
        const nMin = parseFloat(sMin);
        const nMax = parseFloat(sMax);
        this._priceMin = sMin === "" || isNaN(nMin) ? 0 : Math.max(0, nMin);
        this._priceMax = sMax === "" || isNaN(nMax) ? Number.POSITIVE_INFINITY : nMax;

        // Invalid range (min > max): show a ValueState hint instead of silently emptying the list.
        if (isFinite(this._priceMax) && this._priceMin > this._priceMax) {
            const sMsg = this._getText("priceRangeInvalid");
            oMinInput.setValueState(ValueState.Error);
            oMinInput.setValueStateText(sMsg);
            oMaxInput.setValueState(ValueState.Error);
            oMaxInput.setValueStateText(sMsg);
            return;
        }
        oMinInput.setValueState(ValueState.None);
        oMaxInput.setValueState(ValueState.None);
        this._applyFilters();
    }

    public onTogglePriced(oEvent: CheckBox$SelectEvent): void {
        this._onlyPriced = (oEvent.getParameter("selected") as boolean) ?? false;
        this._applyFilters();
    }

    private _applyFilters(): void {
        const oBinding = (this.byId("productGrid") as List).getBinding("items") as ListBinding | undefined;
        if (!oBinding) {return;}
        oBinding.filter(this._buildFilters());
    }

    /** Builds the active OData filters from search/catalog/price/onlyPriced state. */
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
        this._searchFromNav = false;
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

        const oBinding = (this.byId("productGrid") as List).getBinding("items") as ListBinding | undefined;
        if (oBinding) {
            oBinding.filter([]);
            oBinding.sort(new Sorter("ProductName", false));
        }
    }

    public onProductDataReceived(oEvent: Event<{error?: unknown}>): void {
        const oError = oEvent.getParameter("error");
        if (oError) {
            Log.error("CatalogItem list load failed", this._errText(oError));
            MessageBox.error(this._extractODataError(oError, this._getText("productsLoadError")), {
                title: this._getText("productsLoadError")
            });
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

    // -- Navigation --

    public onProductPress(oEvent: Event<object, Control>): void {
        const oCtx = oEvent.getSource().getBindingContext();
        if (!oCtx) {return;}
        const oData = oCtx.getObject() as { CatalogItemUuid: string };

        UIComponent.getRouterFor(this).navTo(Constants.ROUTES.PRODUCT_DETAIL, {
            catalogItemUuid: oData.CatalogItemUuid
        });
    }

    // -- Cart dialog --

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
        const oCtx = oEvent.getSource().getBindingContext();
        if (!oCtx) {return;}
        const oData = oCtx.getObject() as CatalogProduct;

        const oModel = this.getModel("cartDialog") as JSONModel;
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
            hasBundleItems: false
        });

        this._loadDialogDetails(oData.CatalogItemUuid);

        void this._getCartDialog()
            .then((oDialog) => oDialog.open())
            .catch(() => MessageBox.error(this._getText("addToCartError")));
    }

    private _loadDialogDetails(sUuid: string): void {
        const oODataModel = this.getOwnerComponent().getModel() as ODataModel;
        const oDialogModel = this.getModel("cartDialog") as JSONModel;
        oODataModel.read(`${Constants.ODATA.ENTITY_CATALOG_ITEM}(guid'${sUuid}')`, {
            urlParameters: {
                $expand: "to_BundleItem",
                $select: "CatalogItemUuid,ProductSalesDescription,to_BundleItem/BillOfMaterialComponent,to_BundleItem/ComponentDescription,to_BundleItem/BOMItemDescription"
            },
            success: (oData: {
                ProductSalesDescription?: string;
                to_BundleItem?: { results?: Array<Record<string, unknown>> };
            }) => {
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
            },
            error: (oErr: unknown) => {
                Log.warning("Dialog details load failed.", this._errText(oErr));
            }
        });
    }

    public onConfirmAddToCart(): void {
        const oModel = this.getModel("cartDialog") as JSONModel;
        const oProduct: CatalogProduct = {
            CatalogItemUuid: oModel.getProperty("/uuid") as string,
            ProductName: oModel.getProperty("/name") as string,
            Material: oModel.getProperty("/material") as string,
            NetPriceAmount: oModel.getProperty("/price") as number,
            TransactionCurrency: oModel.getProperty("/currency") as string,
            ProductPictureUrl: oModel.getProperty("/pictureUrl") as string
        };
        const nQty = oModel.getProperty("/quantity") as number;

        const oDialog = this._oCartDialog;
        oDialog?.setBusy(true);

        const oODataModel = this.getOwnerComponent().getModel() as ODataModel;
        oODataModel.callFunction(Constants.ODATA.FUNCTION_ADD_TO_CART, {
            method: "POST",
            urlParameters: { CatalogItemUuid: oProduct.CatalogItemUuid },
            success: () => {
                oDialog?.setBusy(false);
                oDialog?.close();
                this._cartService?.addItem(oProduct, nQty);
                const sMsg = this._getText("addedToCart", [oProduct.ProductName]);
                MessageToast.show(sMsg);
                this._announceCartUpdate(sMsg);
            },
            error: (oErr: unknown) => {
                oDialog?.setBusy(false);
                Log.error("addToShoppingCart error", this._errText(oErr));
                MessageBox.error(this._extractODataError(oErr, this._getText("addToCartError")), {
                    title: this._getText("addToCartError")
                });
            }
        });
    }

    public onCancelCartDialog(): void {
        this._oCartDialog?.close();
    }

    // -- Wishlist --

    public onToggleWishlist(oEvent: Event<object, Button>): void {
        const oBtn = oEvent.getSource();
        const oCtx = oBtn.getBindingContext();
        if (!oCtx) {return;}
        const oData = oCtx.getObject() as CatalogProduct;

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
