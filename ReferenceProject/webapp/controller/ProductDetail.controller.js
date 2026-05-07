sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/m/Image",
    "sap/m/Text",
    "sap/m/Title",
    "sap/ui/core/Item",
    "sap/m/MessageToast",
    "sap/m/Link",
    "sap/ui/core/Icon",
    "sapwebshop/utils/CartHelper",
    "sapwebshop/utils/WishlistHelper"
], function (Controller, VBox, HBox, Image, Text, Title, Item, MessageToast, Link, Icon, CartHelper, WishlistHelper) {
    "use strict";

    return Controller.extend("sapwebshop.controller.ProductDetail", {

        onInit: function () {
            this._oProduct = null;
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("ProductDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var sProductId = oEvent.getParameter("arguments").productId;
            var oModel = this.getOwnerComponent().getModel("products");

            var fnLoad = function () {
                var aProducts = oModel.getProperty("/products") || [];
                var oProduct = aProducts.find(function (p) { return p.id === sProductId; });
                if (oProduct) {
                    this._oProduct = oProduct;
                    this._renderProduct(oProduct);
                }
            }.bind(this);

            if (oModel.getProperty("/products")) {
                fnLoad();
            } else {
                oModel.attachRequestCompleted(fnLoad);
            }
        },

        _renderProduct: function (oProduct) {
            // Header info
            this.byId("productName").setText(oProduct.name);
            this.byId("productId").setText("Art.-Nr.: " + oProduct.id);
            this.byId("productManufacturer").setText("| " + oProduct.manufacturer);
            this.byId("productStock").setText(oProduct.availability).setState(oProduct.inStock ? "Success" : "Warning");
            this.byId("productPrice").setText(oProduct.price.toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €");
            this.byId("basePriceText").setText(oProduct.price.toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €");
            this.byId("totalPriceText").setText(oProduct.price.toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €");
            this.byId("mainProductImage").setSrc(oProduct.image);
            this.byId("stockDetailText").setText(
                oProduct.inStock
                    ? "Auf Lager — Lieferung in " + oProduct.deliveryDays + " Werktagen"
                    : "Lieferzeit: " + oProduct.availability
            );
            this.byId("productDescription").setText(oProduct.description);

            // Breadcrumb
            var oBreadcrumb = this.byId("breadcrumbs");
            oBreadcrumb.removeAllLinks();
            oBreadcrumb.addLink(new Link({ text: "Home", press: this.onNavHome.bind(this) }));
            oBreadcrumb.addLink(new Link({
                text: oProduct.category,
                press: function () {
                    this.getOwnerComponent().getRouter().navTo("ProductList", { category: encodeURIComponent(oProduct.category) });
                }.bind(this)
            }));
            oBreadcrumb.setCurrentLocationText(oProduct.name);

            // Variants
            var oVariantSelect = this.byId("variantSelect");
            oVariantSelect.destroyItems();
            (oProduct.variants || []).forEach(function (v) {
                oVariantSelect.addItem(new Item({ key: v.key, text: v.text }));
            });

            // Controllers
            var oCtrlSelect = this.byId("controllerSelect");
            oCtrlSelect.destroyItems();
            (oProduct.controllers || []).forEach(function (c) {
                oCtrlSelect.addItem(new Item({ key: c.key, text: c.text }));
            });

            // Spec highlights
            var oHighlights = this.byId("specHighlights");
            oHighlights.destroyItems();
            if (oProduct.repeatability) {
                oHighlights.addItem(this._createSpecCard("sap-icon://target-group", oProduct.repeatability, "Wiederholgenauigkeit"));
            }
            if (oProduct.payload) {
                oHighlights.addItem(this._createSpecCard("sap-icon://functional-location", oProduct.payload + " kg", "Maximale Traglast"));
            }
            if (oProduct.reach) {
                oHighlights.addItem(this._createSpecCard("sap-icon://navigation-right-arrow", oProduct.reach + " mm", "Reichweite"));
            }

            // Tech data
            var oTechContainer = this.byId("techDataContainer");
            oTechContainer.destroyItems();
            var aSpecs = [
                { label: "Achsanzahl", value: oProduct.axes || "–" },
                { label: "Traglast max.", value: oProduct.payload ? oProduct.payload + " kg" : "–" },
                { label: "Reichweite", value: oProduct.reach ? oProduct.reach + " mm" : "–" },
                { label: "Wiederholgenauigkeit", value: oProduct.repeatability || "–" },
                { label: "Gewicht", value: oProduct.weight ? oProduct.weight + " kg" : "–" },
                { label: "Schutzklasse", value: oProduct.protection || "–" },
                { label: "Schnittstellen", value: oProduct.interfaces || "–" }
            ];
            aSpecs.forEach(function (oSpec) {
                oTechContainer.addItem(new HBox({
                    justifyContent: "SpaceBetween",
                    class: "rsTechRow",
                    items: [
                        new Text({ text: oSpec.label, class: "rsTechLabel" }),
                        new Text({ text: String(oSpec.value), class: "rsTechValue" })
                    ]
                }));
            });

            // Thumbnail
            var oThumbContainer = this.byId("thumbnailContainer");
            oThumbContainer.destroyItems();
            oThumbContainer.addItem(new Image({ src: oProduct.image, width: "60px", height: "60px", class: "rsThumbnail rsThumbActive" }));

            // Sync wishlist button state
            this._updateWishlistBtn();
        },

        _createSpecCard: function (sIcon, sValue, sLabel) {
            return new VBox({
                alignItems: "Center",
                class: "rsSpecCard",
                items: [
                    new Icon({ src: sIcon, size: "2rem", color: "#0064d9", class: "sapUiTinyMarginBottom" }),
                    new Title({ text: sValue, level: "H5" }),
                    new Text({ text: sLabel, class: "rsSpecLabel" })
                ]
            });
        },

        // Updates the wishlist button appearance based on current wishlist state
        _updateWishlistBtn: function () {
            var oBtn = this.byId("pdpWishlistBtn");
            if (!oBtn || !this._oProduct) return;
            var oWishlistModel = this.getOwnerComponent().getModel("wishlist");
            var bInWishlist = WishlistHelper.isInWishlist(oWishlistModel, this._oProduct.id);
            if (bInWishlist) {
                oBtn.addStyleClass("rsHeartActive");
                oBtn.setText("Auf Wunschliste");
            } else {
                oBtn.removeStyleClass("rsHeartActive");
                oBtn.setText("Zur Wunschliste");
            }
        },

        onQuantityChange: function () {
            if (!this._oProduct) return;
            var nQty = this.byId("quantityInput").getValue();
            var nTotal = this._oProduct.price * nQty;
            this.byId("totalPriceText").setText(nTotal.toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €");
        },

        onAddToCart: function () {
            if (!this._oProduct) return;
            var nQty = parseInt(this.byId("quantityInput").getValue(), 10) || 1;
            var sVariant = this.byId("variantSelect").getSelectedItem() ? this.byId("variantSelect").getSelectedItem().getText() : "Standard";
            var sController = this.byId("controllerSelect").getSelectedItem() ? this.byId("controllerSelect").getSelectedItem().getText() : "";

            CartHelper.addToCart(this.getOwnerComponent().getModel("cart"), this._oProduct, nQty, sVariant, sController);

            // Brief flash animation on the button
            var oCartBtn = this.byId("addToCartBtn");
            oCartBtn.addStyleClass("rsCartBtnFlash");
            setTimeout(function () { oCartBtn.removeStyleClass("rsCartBtnFlash"); }, 500);

            MessageToast.show(this._oProduct.name + " zum Warenkorb hinzugefügt.");
        },

        onAddToWishlist: function () {
            if (!this._oProduct) return;
            var oWishlistModel = this.getOwnerComponent().getModel("wishlist");
            var bNowInWishlist = WishlistHelper.toggle(oWishlistModel, this._oProduct);
            this._updateWishlistBtn();
            if (bNowInWishlist) {
                MessageToast.show(this._oProduct.name + " zur Wunschliste hinzugefügt.");
            } else {
                MessageToast.show(this._oProduct.name + " von Wunschliste entfernt.");
            }
        },

        onNavBack: function () {
            window.history.go(-1);
        },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

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
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            if (sQuery) {
                this.getOwnerComponent().getRouter().navTo("ProductList", { category: "search:" + encodeURIComponent(sQuery) });
            }
        },

        onDownload: function () {
            MessageToast.show("Download wird vorbereitet...");
        },

        onContactSales: function () {
            MessageToast.show("Vertrieb: +49 800 SAP-ROBO");
        }
    });
});
