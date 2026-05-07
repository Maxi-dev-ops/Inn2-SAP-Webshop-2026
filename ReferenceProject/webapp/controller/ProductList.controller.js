sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/m/Image",
    "sap/m/Title",
    "sap/m/Text",
    "sap/m/Button",
    "sap/m/ObjectNumber",
    "sap/m/ObjectStatus",
    "sap/m/MessageToast",
    "sap/m/Panel",
    "sapwebshop/utils/CartHelper",
    "sapwebshop/utils/WishlistHelper"
], function (Controller, JSONModel, VBox, HBox, Image, Title, Text, Button, ObjectNumber, ObjectStatus, MessageToast, Panel, CartHelper, WishlistHelper) {
    "use strict";

    return Controller.extend("sapwebshop.controller.ProductList", {

        onInit: function () {
            this._oFilteredModel = new JSONModel({ items: [] });
            this.getView().setModel(this._oFilteredModel, "filteredProducts");
            this._sActiveCategory = "all";
            this._nMaxPrice = 90000;
            this._aManufacturers = [];
            this._bOnlyInStock = false;
            this._bOnlyBackorder = false;
            this._sSortKey = "featured";
            this._bGridView = true;

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("ProductList").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var sCategory = decodeURIComponent(oEvent.getParameter("arguments").category || "all");
            if (sCategory.startsWith("search:")) {
                this._sSearchQuery = sCategory.replace("search:", "");
                this._sActiveCategory = "all";
                var oSearch = this.byId("pageSearch");
                if (oSearch) oSearch.setValue(this._sSearchQuery);
            } else {
                this._sSearchQuery = "";
                this._sActiveCategory = sCategory;
                this._preselectCategory(sCategory);
            }
            this._applyFilters();
        },

        _preselectCategory: function (sCategory) {
            var mMap = { "all": 0, "Industrieroboter": 1, "Kollaborationsroboter": 2, "Mobile Roboter": 3, "Serviceroboter": 4 };
            var oGroup = this.byId("categoryFilter");
            if (oGroup) {
                var nIdx = mMap[sCategory] !== undefined ? mMap[sCategory] : 0;
                oGroup.setSelectedIndex(nIdx);
            }
        },

        _applyFilters: function () {
            var oModel = this.getOwnerComponent().getModel("products");
            var aAll = oModel.getProperty("/products") || [];

            var aFiltered = aAll.filter(function (p) {
                if (this._sActiveCategory && this._sActiveCategory !== "all" && p.category !== this._sActiveCategory) return false;
                if (this._sSearchQuery && !p.name.toLowerCase().includes(this._sSearchQuery.toLowerCase()) && !p.description.toLowerCase().includes(this._sSearchQuery.toLowerCase())) return false;
                if (p.price > this._nMaxPrice) return false;
                if (this._aManufacturers.length > 0 && !this._aManufacturers.includes(p.manufacturer)) return false;
                if (this._bOnlyInStock && !p.inStock) return false;
                if (this._bOnlyBackorder && p.inStock) return false;
                return true;
            }.bind(this));

            aFiltered = this._sort(aFiltered);
            this._oFilteredModel.setProperty("/items", aFiltered);
            var oText = this.byId("resultCountText");
            if (oText) oText.setText(aFiltered.length + " Produkte gefunden");
            this._renderGrid(aFiltered);
        },

        _sort: function (aItems) {
            var sCopy = aItems.slice();
            switch (this._sSortKey) {
                case "priceAsc": sCopy.sort(function (a, b) { return a.price - b.price; }); break;
                case "priceDesc": sCopy.sort(function (a, b) { return b.price - a.price; }); break;
                case "name": sCopy.sort(function (a, b) { return a.name.localeCompare(b.name); }); break;
                default: sCopy.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
            }
            return sCopy;
        },

        _renderGrid: function (aProducts) {
            var oGrid = this.byId("productGrid");
            if (!oGrid) return;
            oGrid.destroyItems();
            aProducts.forEach(function (oProduct) {
                oGrid.addItem(this._createProductCard(oProduct));
            }.bind(this));
        },

        _createProductCard: function (oProduct) {
            var that = this;
            var oWishlistModel = this.getOwnerComponent().getModel("wishlist");
            var bInWishlist = WishlistHelper.isInWishlist(oWishlistModel, oProduct.id);

            // Heart button — toggles wishlist, turns red when active, no navigation
            var oHeartBtn = new Button({
                icon: "sap-icon://heart",
                type: "Transparent",
                tooltip: bInWishlist ? "Von Wunschliste entfernen" : "Zur Wunschliste hinzufügen",
                press: function (oEvent) {
                    oEvent.cancelBubble();
                    var bNowInWishlist = WishlistHelper.toggle(oWishlistModel, oProduct);
                    if (bNowInWishlist) {
                        oHeartBtn.addStyleClass("rsHeartActive");
                        oHeartBtn.setTooltip("Von Wunschliste entfernen");
                        MessageToast.show(oProduct.name + " zur Wunschliste hinzugefügt.");
                    } else {
                        oHeartBtn.removeStyleClass("rsHeartActive");
                        oHeartBtn.setTooltip("Zur Wunschliste hinzufügen");
                        MessageToast.show(oProduct.name + " von Wunschliste entfernt.");
                    }
                }
            });
            if (bInWishlist) {
                oHeartBtn.addStyleClass("rsHeartActive");
            }
            oHeartBtn.addStyleClass("rsCardHeartBtn");

            // Cart button — adds to cart with flash animation, no navigation
            var oCartBtn = oProduct.inStock
                ? new Button({
                    text: "In den Warenkorb",
                    type: "Emphasized",
                    icon: "sap-icon://cart",
                    press: function (oEvent) {
                        oEvent.cancelBubble();
                        CartHelper.addToCart(that.getOwnerComponent().getModel("cart"), oProduct);
                        oCartBtn.addStyleClass("rsCartBtnFlash");
                        setTimeout(function () { oCartBtn.removeStyleClass("rsCartBtnFlash"); }, 500);
                        MessageToast.show(oProduct.name + " zum Warenkorb hinzugefügt.");
                    }
                })
                : new Button({
                    text: "Vormerken",
                    type: "Default",
                    press: function (oEvent) {
                        oEvent.cancelBubble();
                        MessageToast.show("Vorgemerkt: " + oProduct.name);
                    }
                });

            var oCard = new Panel({
                class: "rsProductCard",
                content: [
                    new VBox({
                        class: "rsProductCardImageWrap",
                        items: [
                            oHeartBtn,
                            new Image({ src: oProduct.image, width: "100%", height: "140px", decorative: true, class: "rsProductCardImg" })
                        ]
                    }),
                    new VBox({
                        class: "rsProductCardBody",
                        items: [
                            new Title({ text: oProduct.name, level: "H5", class: "rsProductCardTitle" }),
                            new Text({ text: oProduct.id + " | " + oProduct.manufacturer, class: "rsProductCardId sapUiTinyMarginBottom" }),
                            new HBox({
                                class: "sapUiTinyMarginBottom",
                                items: [
                                    new ObjectStatus({ text: oProduct.availability, state: oProduct.inStock ? "Success" : "Warning", class: "sapUiTinyMarginEnd" }),
                                    new Text({ text: "Traglast: " + (oProduct.payload || "–") + " kg", class: "rsPayloadText" })
                                ]
                            }),
                            new ObjectNumber({ number: oProduct.price.toLocaleString("de-DE", { minimumFractionDigits: 2 }), unit: "€", emphasized: true, class: "sapUiTinyMarginBottom" }),
                            new HBox({
                                class: "sapUiTinyMarginTop",
                                items: [oCartBtn]
                            })
                        ]
                    })
                ]
            });

            oCard.addStyleClass("rsProductCardClickable");
            oCard.attachBrowserEvent("click", function (oEvent) {
                if (oEvent.target.closest("button") || oEvent.target.closest(".sapMBtn")) { return; }
                that.getOwnerComponent().getRouter().navTo("ProductDetail", { productId: oProduct.id });
            });
            return oCard;
        },

        onCategoryFilter: function (oEvent) {
            var nIdx = oEvent.getParameter("selectedIndex");
            var aCategories = ["all", "Industrieroboter", "Kollaborationsroboter", "Mobile Roboter", "Serviceroboter"];
            this._sActiveCategory = aCategories[nIdx] || "all";
            this._applyFilters();
        },

        onPriceLiveChange: function (oEvent) {
            var nVal = oEvent.getParameter("value");
            var oText = this.byId("priceRangeText");
            if (oText) oText.setText("bis € " + nVal.toLocaleString("de-DE"));
        },

        onPriceFilter: function (oEvent) {
            this._nMaxPrice = oEvent.getParameter("value");
            this._applyFilters();
        },

        onManufacturerFilter: function () {
            var aMap = [
                { id: "mfrKUKA", name: "KUKA Robotics" },
                { id: "mfrABB", name: "ABB Robotics" },
                { id: "mfrFANUC", name: "FANUC" },
                { id: "mfrUR", name: "Universal Robots" }
            ];
            this._aManufacturers = aMap.filter(function (m) {
                var oChk = this.byId(m.id);
                return oChk && oChk.getSelected();
            }.bind(this)).map(function (m) { return m.name; });
            this._applyFilters();
        },

        onAvailabilityFilter: function () {
            var oInStock = this.byId("availInStock");
            var oBackorder = this.byId("availBackorder");
            this._bOnlyInStock = oInStock && oInStock.getSelected();
            this._bOnlyBackorder = oBackorder && oBackorder.getSelected();
            this._applyFilters();
        },

        onResetFilters: function () {
            this._sActiveCategory = "all";
            this._nMaxPrice = 90000;
            this._aManufacturers = [];
            this._bOnlyInStock = false;
            this._bOnlyBackorder = false;
            this._sSearchQuery = "";
            var oGroup = this.byId("categoryFilter");
            if (oGroup) oGroup.setSelectedIndex(0);
            var oSlider = this.byId("priceSlider");
            if (oSlider) oSlider.setValue(90000);
            var oText = this.byId("priceRangeText");
            if (oText) oText.setText("bis € 90.000");
            ["mfrKUKA", "mfrABB", "mfrFANUC", "mfrUR", "availInStock", "availBackorder"].forEach(function (sId) {
                var o = this.byId(sId);
                if (o) o.setSelected(false);
            }.bind(this));
            var oSearch = this.byId("pageSearch");
            if (oSearch) oSearch.setValue("");
            this._applyFilters();
        },

        onSearch: function (oEvent) {
            this._sSearchQuery = oEvent.getParameter("query") || "";
            this._applyFilters();
        },

        onSortChange: function (oEvent) {
            this._sSortKey = oEvent.getParameter("selectedItem").getKey();
            this._applyFilters();
        },

        onToggleView: function () {
            this._bGridView = !this._bGridView;
            var oGrid = this.byId("productGrid");
            var oList = this.byId("productList");
            var oGridBtn = this.byId("gridViewBtn");
            var oListBtn = this.byId("listViewBtn");
            if (this._bGridView) {
                oGrid.setVisible(true);
                oList.setVisible(false);
                oGridBtn.setType("Emphasized");
                oListBtn.setType("Transparent");
            } else {
                oGrid.setVisible(false);
                oList.setVisible(true);
                oGridBtn.setType("Transparent");
                oListBtn.setType("Emphasized");
            }
        },

        onProductPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("filteredProducts");
            var sId = oCtx.getProperty("id");
            this.getOwnerComponent().getRouter().navTo("ProductDetail", { productId: sId });
        },

        // Formatter for list view: price with € on the right (de-DE format)
        formatPrice: function (nPrice) {
            return nPrice ? nPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €" : "";
        },

        formatStockState: function (bInStock) {
            return bInStock ? "Success" : "Warning";
        },

        onNavBack: function () { window.history.go(-1); },
        onNavHome: function () { this.getOwnerComponent().getRouter().navTo("Home"); },

        onCartPress: function () {
            this.getOwnerComponent().getRouter().navTo("Cart");
        },

        onWishlistPress: function () {
            this.getOwnerComponent().getRouter().navTo("Wishlist");
        },

        onNotificationsPress: function () {
            this.getOwnerComponent().getRouter().navTo("Notifications");
        },

        onUserPress: function () {
            this.getOwnerComponent().getRouter().navTo("Profile");
        }
    });
});
