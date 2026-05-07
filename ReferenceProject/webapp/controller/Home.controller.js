sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/m/Image",
    "sap/m/Title",
    "sap/m/Text",
    "sap/m/Button",
    "sap/m/ObjectNumber",
    "sap/ui/core/Icon",
    "sap/m/MessageToast",
    "sap/m/RatingIndicator",
    "sap/m/ObjectStatus",
    "sap/m/Panel",
    "sap/m/Carousel"
], function (Controller, VBox, HBox, Image, Title, Text, Button, ObjectNumber, Icon, MessageToast, RatingIndicator, ObjectStatus, Panel, Carousel) {
    "use strict";

    return Controller.extend("sapwebshop.controller.Home", {

        onInit: function () {
            var oModel = this.getOwnerComponent().getModel("products");
            var fnBuild = function () {
                this._buildCategories();
                this._buildDealOfTheDay();
                this._buildFeaturedProducts();
                this._buildNewProducts();
            }.bind(this);
            if (oModel.getProperty("/products")) {
                fnBuild();
            } else {
                oModel.attachRequestCompleted(fnBuild);
            }
        },

        _buildCategories: function () {
            var oBox = this.byId("categoryRow");
            if (!oBox) return;
            oBox.destroyItems();
            var aCategories = [
                { id: "Industrieroboter",     icon: "sap-icon://factory",      label: "Industrieroboter" },
                { id: "Kollaborationsroboter", icon: "sap-icon://group",        label: "Kollaborationsroboter" },
                { id: "Mobile Roboter",        icon: "sap-icon://cargo-train",  label: "Mobile Roboter" },
                { id: "Serviceroboter",        icon: "sap-icon://wrench",       label: "Serviceroboter" }
            ];
            var that = this;
            aCategories.forEach(function (oCat) {
                var oIconBox = new HBox({
                    alignItems: "Center",
                    justifyContent: "Center",
                    items: [new Icon({ src: oCat.icon, size: "1rem", color: "#0064d9" })]
                }).addStyleClass("rsCategoryPillIcon");

                var oLabel = new Text({ text: oCat.label })
                    .addStyleClass("rsCategoryPillText sapUiTinyMarginBegin sapUiTinyMarginEnd");

                var oCard = new HBox({
                    alignItems: "Center",
                    width: "auto",
                    items: [oIconBox, oLabel]
                }).addStyleClass("rsCategoryPill");

                oCard.attachBrowserEvent("click", function () {
                    that.getOwnerComponent().getRouter().navTo("ProductList", { category: encodeURIComponent(oCat.id) });
                });
                oBox.addItem(oCard);
            });
        },

        _buildDealOfTheDay: function () {
            var oModel = this.getOwnerComponent().getModel("products");
            var oContainer = this.byId("dealOfTheDay");
            if (!oContainer) return;
            oContainer.destroyItems();

            var aProducts = oModel.getProperty("/products") || [];
            var oDealProduct = aProducts.find(p => p.isNew); // Let's take the first new product as the deal

            if (!oDealProduct) return;

            var that = this;

            var oDealCard = new Panel({
                width: "100%",
                content: [
                    new HBox({
                        width: "100%",
                        alignItems: "Center",
                        items: [
                            new Image({
                                src: oDealProduct.image,
                                    width: "240px",
                                    height: "240px"
                            }).addStyleClass("rsDealImage sapUiMediumMarginEnd"),
                            new VBox({
                                justifyContent: "Center",
                                items: [
                                    new Text({ text: "Angebot des Tages" }).addStyleClass("rsDealLabel sapUiTinyMarginBottom"),
                                    new Title({ text: oDealProduct.name, level: "H2" }).addStyleClass("rsDealTitle sapUiTinyMarginBottom"),
                                    new Text({ text: oDealProduct.description.split('\n')[0], maxLines: 3 }).addStyleClass("rsDealText"),
                                    new HBox({
                                        justifyContent: "SpaceBetween",
                                        alignItems: "Center",
                                        width: "100%",
                                        items: [
                                            new HBox({
                                                alignItems: "Baseline",
                                                items: [
                                                    new ObjectNumber({
                                                        number: oDealProduct.price.toLocaleString("de-DE", { minimumFractionDigits: 2 }),
                                                        unit: "€",
                                                        emphasized: true
                                                    }).addStyleClass("rsDealPrice"),
                                                    new Text({ text: "statt " + (oDealProduct.price * 1.25).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €" }).addStyleClass("rsDealOldPrice sapUiSmallMarginBegin")
                                                ]
                                            }),
                                            new Button({
                                                text: "Zum Angebot",
                                                type: "Emphasized",
                                                icon: "sap-icon://arrow-right",
                                                iconFirst: false,
                                                press: function() {
                                                    that.getOwnerComponent().getRouter().navTo("ProductDetail", { productId: oDealProduct.id });
                                                }
                                            })
                                        ]
                                    }).addStyleClass("sapUiSmallMarginTop")
                                ]
                            }).addStyleClass("rsDealInfoBox sapUiSmallMarginBegin")
                        ]
                    })
                ]
            }).addStyleClass("rsDealCard");
            oContainer.addItem(oDealCard);
        },

        _buildFeaturedProducts: function () {
            var oModel = this.getOwnerComponent().getModel("products");
            var oCarousel = this.byId("featuredProductsCarousel");
            if (!oCarousel) return;
            oCarousel.destroyPages();
            
            var aProducts = oModel.getProperty("/products") || [];
            var aFeatured = aProducts.filter(function (p) { return p.featured; });
            
            // Gruppiere Produkte in 3er-Blöcke pro Karussell-Seite
            var iChunkSize = 3;
            for (var i = 0; i < aFeatured.length; i += iChunkSize) {
                var aChunk = aFeatured.slice(i, i + iChunkSize);
                var oPageBox = new HBox({
                    items: aChunk.map(function(oProduct) {
                        return this._createProductCard(oProduct);
                    }.bind(this))
                }).addStyleClass("rsCarouselPageBox");
                oCarousel.addPage(oPageBox);
            }
        },

        _createProductCard: function (oProduct) {
            var that = this;

            var aBadges = [];
            if (oProduct.isNew) {
                aBadges.push(new Text({ text: "Neu" }).addStyleClass("rsNewBadge sapUiTinyMarginEnd"));
            }
            if (oProduct.featured) {
                aBadges.push(new Text({ text: "Tipp" }).addStyleClass("rsFeaturedBadge"));
            }

            var oHeartBtn = new Button({
                icon: "sap-icon://heart",
                type: "Transparent",
                press: function (oEvent) {
                    if (oEvent.cancelBubble) { oEvent.cancelBubble(); }
                    if (oEvent.preventDefault) { oEvent.preventDefault(); }
                    that._addToWishlist(oProduct);
                }
            }).addStyleClass("rsCardHeartBtn");

            var oCard = new VBox({
                items: [
                    new VBox({
                        renderType: "Bare",
                        items: [
                            oHeartBtn,
                            new Image({ src: oProduct.image, width: "100%", height: "180px" })
                        ]
                    }).addStyleClass("rsProductCardImageWrap"),
                    new VBox({
                        renderType: "Bare",
                        items: [
                            new HBox({ items: aBadges }).addStyleClass("rsProductBadgeRow"),
                            new RatingIndicator({ value: oProduct.rating || 0, maxValue: 5, enabled: false }).addStyleClass("sapUiTinyMarginBottom"),
                            new Title({ text: oProduct.name, level: "H5" }).addStyleClass("rsProductCardTitle"),
                            new Text({ text: oProduct.manufacturer }).addStyleClass("rsProductCardId sapUiSmallMarginBottom"),
                            new ObjectStatus({ text: oProduct.inStock ? "Auf Lager" : "Bestellbar", state: oProduct.inStock ? "Success" : "Warning" }).addStyleClass("sapUiTinyMarginBottom"),
                            new ObjectNumber({ number: oProduct.price.toLocaleString("de-DE", { minimumFractionDigits: 2 }), unit: "€", emphasized: true }).addStyleClass("rsProductPrice sapUiSmallMarginBottom"),
                            new Button({
                                text: "In den Warenkorb",
                                type: "Emphasized",
                                icon: "sap-icon://cart",
                                width: "100%",
                                press: function (oEvent) {
                                    if (oEvent.cancelBubble) { oEvent.cancelBubble(); }
                                    if (oEvent.preventDefault) { oEvent.preventDefault(); }
                                    that._addToCart(oProduct);
                                }
                            }).addStyleClass("rsAddToCartBtn")
                        ]
                    }).addStyleClass("rsProductCardBody")
                ]
            }).addStyleClass("rsProductCard");

            oCard.attachBrowserEvent("click", function (oEvent) {
                if (oEvent.target.closest("button") || oEvent.target.closest(".sapMBtn")) { return; }
                that.getOwnerComponent().getRouter().navTo("ProductDetail", { productId: oProduct.id });
            });

            return oCard;
        },

        _buildNewProducts: function () {
            var oModel = this.getOwnerComponent().getModel("products");
            var oBox = this.byId("newProductsBox");
            if (!oBox) return;
            oBox.destroyItems();
            var aProducts = oModel.getProperty("/products") || [];
            var aNewProducts = aProducts.filter(p => p.isNew);
            
            // Falls weniger als 4 neue Produkte da sind, füllen wir mit anderen auf
            if (aNewProducts.length < 4) {
                var aOthers = aProducts.filter(p => !p.isNew).slice(0, 4 - aNewProducts.length);
                aNewProducts = aNewProducts.concat(aOthers);
            }
            
            aNewProducts.forEach(function (oProduct) {
                oBox.addItem(this._createProductCard(oProduct));
            }.bind(this));
        },

        _addToCart: function (oProduct) {
            var oCartModel = this.getOwnerComponent().getModel("cart");
            var aItems = oCartModel.getProperty("/items") || [];
            var oExisting = aItems.find(function (i) { return i.id === oProduct.id; });
            if (oExisting) {
                oExisting.quantity += 1;
                oExisting.totalPrice = oExisting.quantity * oExisting.price;
            } else {
                aItems.push({ id: oProduct.id, name: oProduct.name, price: oProduct.price, image: oProduct.image, quantity: 1, totalPrice: oProduct.price, variant: "Standard", controller: "", manufacturer: oProduct.manufacturer, availability: oProduct.availability });
            }
            var nTotal = aItems.reduce(function (s, i) { return s + i.totalPrice; }, 0);
            var nCount = aItems.reduce(function (s, i) { return s + i.quantity; }, 0);
            oCartModel.setProperty("/items", aItems);
            oCartModel.setProperty("/totalPrice", nTotal);
            oCartModel.setProperty("/totalCount", nCount);
            MessageToast.show(oProduct.name + " zum Warenkorb hinzugefügt.");
        },

        _addToWishlist: function (oProduct) {
            var oWishlistModel = this.getOwnerComponent().getModel("wishlist");
            var aItems = oWishlistModel.getProperty("/items") || [];
            if (!aItems.some(function (i) { return i.id === oProduct.id; })) {
                aItems.push(oProduct);
                oWishlistModel.setProperty("/items", aItems);
                MessageToast.show(oProduct.name + " zur Wunschliste hinzugefügt.");
            } else {
                MessageToast.show(oProduct.name + " ist bereits auf der Wunschliste.");
            }
        },

        onCategoryPress: function (oEvent) {
            var sCategory = oEvent.getSource().data("category");
            this.getOwnerComponent().getRouter().navTo("ProductList", { category: encodeURIComponent(sCategory) });
        },

        onAllCategoriesPress: function () {
            this.getOwnerComponent().getRouter().navTo("ProductList", { category: "all" });
        },

        onAllProductsPress: function () {
            this.getOwnerComponent().getRouter().navTo("ProductList", { category: "all" });
        },

        onExplorePress: function () {
            this.getOwnerComponent().getRouter().navTo("ProductList", { category: "all" });
        },

        onDownloadCatalog: function () {
            MessageToast.show("Katalog-Download wird vorbereitet...");
        },

        onHeaderSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            if (sQuery) {
                this.getOwnerComponent().getRouter().navTo("ProductList", { category: "search:" + encodeURIComponent(sQuery) });
            }
        },

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

        onSupportPress: function () {
            this.getOwnerComponent().getRouter().navTo("Support");
        },

        onUserPress: function () {
            this.getOwnerComponent().getRouter().navTo("Profile");
        }
    });
});
