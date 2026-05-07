sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/m/Image",
    "sap/m/Title",
    "sap/m/Text",
    "sap/m/Button",
    "sap/m/ObjectNumber",
    "sap/m/ObjectStatus",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sapwebshop/utils/CartHelper",
    "sapwebshop/utils/WishlistHelper"
], function (Controller, VBox, HBox, Image, Title, Text, Button, ObjectNumber, ObjectStatus, MessageToast, MessageBox, CartHelper, WishlistHelper) {
    "use strict";

    return Controller.extend("sapwebshop.controller.Wishlist", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("Wishlist").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._renderWishlist();
            this._renderRecommendations();
        },

        _renderWishlist: function () {
            var oWishlistModel = this.getOwnerComponent().getModel("wishlist");
            var aItems = oWishlistModel.getProperty("/items") || [];
            var oGrid = this.byId("wishlistGrid");
            var oEmpty = this.byId("emptyWishlist");
            var oTitle = this.byId("wishlistTitle");

            oGrid.destroyItems();

            if (aItems.length === 0) {
                oGrid.setVisible(false);
                if (oEmpty) oEmpty.setVisible(true);
                if (oTitle) oTitle.setText("Meine Wunschliste");
            } else {
                oGrid.setVisible(true);
                if (oEmpty) oEmpty.setVisible(false);
                if (oTitle) oTitle.setText("Meine Wunschliste (" + aItems.length + " Produkte)");
                aItems.forEach(function (oProduct) {
                    oGrid.addItem(this._createWishlistCard(oProduct));
                }.bind(this));
            }
        },

        _createWishlistCard: function (oProduct) {
            var that = this;

            // Heart button at top-right — red (already on wishlist) — click removes
            var oRemoveBtn = new Button({
                icon: "sap-icon://heart",
                type: "Transparent",
                tooltip: "Von Wunschliste entfernen",
                press: function () { that.onRemoveItem(oProduct); }
            }).addStyleClass("rsWishlistHeartBtn rsHeartActive");

            var oCartBtn = oProduct.inStock
                ? new Button({
                    text: "In den Warenkorb",
                    type: "Emphasized",
                    icon: "sap-icon://cart",
                    width: "100%",
                    press: function () {
                        CartHelper.addToCart(that.getOwnerComponent().getModel("cart"), oProduct);
                        MessageToast.show(oProduct.name + " zum Warenkorb hinzugefügt.");
                    }
                })
                : new Button({
                    text: "Vormerken",
                    type: "Default",
                    width: "100%",
                    press: function () { MessageToast.show("Vorgemerkt: " + oProduct.name); }
                });

            return new VBox({
                items: [
                    new VBox({
                        renderType: "Bare",
                        items: [
                            oRemoveBtn,
                            new Image({ src: oProduct.image, width: "100%", height: "160px", decorative: true })
                        ]
                    }).addStyleClass("rsProductCardImageWrap"),
                    new VBox({
                        renderType: "Bare",
                        items: [
                            oProduct.isNew
                                ? new Text({ text: "Neu" }).addStyleClass("rsNewBadge sapUiTinyMarginBottom")
                                : new Text({ text: "" }),
                            new Title({ text: oProduct.name, level: "H5" }).addStyleClass("rsProductCardTitle"),
                            new Text({ text: oProduct.manufacturer }).addStyleClass("rsProductCardId sapUiTinyMarginBottom"),
                            new ObjectStatus({ text: oProduct.availability, state: oProduct.inStock ? "Success" : "Warning" }).addStyleClass("sapUiTinyMarginBottom"),
                            new ObjectNumber({ number: oProduct.price.toLocaleString("de-DE", { minimumFractionDigits: 2 }), unit: "€", emphasized: true }).addStyleClass("rsProductPrice sapUiSmallMarginBottom"),
                            oCartBtn
                        ]
                    }).addStyleClass("rsProductCardBody")
                ]
            }).addStyleClass("rsWishlistCard");
        },

        _renderRecommendations: function () {
            var oProductsModel = this.getOwnerComponent().getModel("products");
            var oWishlistModel = this.getOwnerComponent().getModel("wishlist");
            var oBox = this.byId("recommendationsBox");
            if (!oBox) return;
            oBox.destroyItems();

            var fnRender = function () {
                var aAll = oProductsModel.getProperty("/products") || [];
                var aWish = oWishlistModel.getProperty("/items") || [];
                var aWishIds = aWish.map(function (i) { return i.id; });
                var aRecs = aAll.filter(function (p) { return !aWishIds.includes(p.id); }).slice(0, 4);
                aRecs.forEach(function (oProduct) {
                    oBox.addItem(this._createRecommendCard(oProduct));
                }.bind(this));
            }.bind(this);

            if (oProductsModel.getProperty("/products")) {
                fnRender();
            } else {
                oProductsModel.attachRequestCompleted(fnRender);
            }
        },

        _createRecommendCard: function (oProduct) {
            var that = this;
            var oHeartBtn = new Button({
                icon: "sap-icon://heart",
                tooltip: "Zur Wunschliste",
                type: "Transparent",
                press: function () { that._addToWishlist(oProduct); }
            }).addStyleClass("rsCardHeartBtn");

            return new VBox({
                items: [
                    new VBox({
                        renderType: "Bare",
                        items: [oHeartBtn, new Image({ src: oProduct.image, width: "100%", height: "180px", decorative: true })]
                    }).addStyleClass("rsProductCardImageWrap"),
                    new VBox({
                        renderType: "Bare",
                        items: [
                            new Title({ text: oProduct.name, level: "H5" }).addStyleClass("rsProductCardTitle"),
                            new Text({ text: oProduct.manufacturer }).addStyleClass("rsProductCardId sapUiTinyMarginBottom"),
                            new ObjectStatus({ text: oProduct.availability, state: oProduct.inStock ? "Success" : "Warning" }).addStyleClass("sapUiTinyMarginBottom"),
                            new ObjectNumber({ number: oProduct.price.toLocaleString("de-DE", { minimumFractionDigits: 2 }), unit: "€", emphasized: true }).addStyleClass("rsProductPrice sapUiSmallMarginBottom"),
                            oProduct.inStock
                                ? new Button({
                                    text: "Kaufen",
                                    type: "Emphasized",
                                    width: "100%",
                                    press: function () {
                                        that.getOwnerComponent().getRouter().navTo("ProductDetail", { productId: oProduct.id });
                                    }
                                })
                                : new Button({
                                    text: "Vormerken",
                                    type: "Default",
                                    width: "100%",
                                    press: function () { MessageToast.show("Vorgemerkt: " + oProduct.name); }
                                })
                        ]
                    }).addStyleClass("rsProductCardBody")
                ]
            }).addStyleClass("rsProductCard");
        },

        _addToWishlist: function (oProduct) {
            var oWishlistModel = this.getOwnerComponent().getModel("wishlist");
            var bAdded = WishlistHelper.addToWishlist(oWishlistModel, oProduct);
            if (bAdded) {
                this._renderWishlist();
                this._renderRecommendations();
                MessageToast.show(oProduct.name + " zur Wunschliste hinzugefügt.");
            } else {
                MessageToast.show(oProduct.name + " ist bereits auf der Wunschliste.");
            }
        },

        onRemoveItem: function (oProduct) {
            var oWishlistModel = this.getOwnerComponent().getModel("wishlist");
            WishlistHelper.removeFromWishlist(oWishlistModel, oProduct.id);
            this._renderWishlist();
            this._renderRecommendations();
            MessageToast.show(oProduct.name + " von Wunschliste entfernt.");
        },

        onAddAllToCart: function () {
            var oWishlistModel = this.getOwnerComponent().getModel("wishlist");
            var aItems = oWishlistModel.getProperty("/items") || [];
            if (aItems.length === 0) {
                MessageToast.show("Ihre Wunschliste ist leer.");
                return;
            }
            var oCartModel = this.getOwnerComponent().getModel("cart");
            aItems.filter(function (p) { return p.inStock; }).forEach(function (p) {
                CartHelper.addToCart(oCartModel, p);
            });
            MessageToast.show("Alle verfügbaren Artikel in den Warenkorb gelegt.");
        },

        onClearWishlist: function () {
            MessageBox.confirm("Möchten Sie die Wunschliste wirklich leeren?", {
                title: "Liste leeren",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        this.getOwnerComponent().getModel("wishlist").setProperty("/items", []);
                        this._renderWishlist();
                        this._renderRecommendations();
                    }
                }.bind(this)
            });
        },

        onDiscoverProducts: function () {
            this.getOwnerComponent().getRouter().navTo("ProductList", { category: "all" });
        },

        onNavBack: function () { window.history.go(-1); },
        onNavHome: function () { this.getOwnerComponent().getRouter().navTo("Home"); },
        onCartPress: function () { this.getOwnerComponent().getRouter().navTo("Cart"); },
        onWishlistPress: function () {},
        onNotificationsPress: function () { this.getOwnerComponent().getRouter().navTo("Notifications"); },
        onUserPress: function () { this.getOwnerComponent().getRouter().navTo("Profile"); },
        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            if (sQuery) {
                this.getOwnerComponent().getRouter().navTo("ProductList", { category: "search:" + encodeURIComponent(sQuery) });
            }
        }
    });
});
