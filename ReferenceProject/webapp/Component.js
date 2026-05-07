sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
    "use strict";

    return UIComponent.extend("sapwebshop.Component", {
        metadata: {
            manifest: "json",
            interfaces: ["sap.ui.core.IAsyncContentCreation"]
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            var oCartModel = new JSONModel({ items: [], totalCount: 0, totalPrice: 0 });
            this.setModel(oCartModel, "cart");

            var oWishlistModel = new JSONModel({ items: [] });
            this.setModel(oWishlistModel, "wishlist");

            // Convert relative image paths to absolute module URLs so they resolve
            // correctly regardless of whether the app is launched via FLP or index.html
            var sBase = sap.ui.require.toUrl("sapwebshop") + "/";
            var oProductsModel = this.getModel("products");
            var fnFixImages = function () {
                var aProducts = oProductsModel.getProperty("/products") || [];
                aProducts.forEach(function (p) {
                    if (p.image && !p.image.startsWith("http")) {
                        p.image = sBase + p.image;
                    }
                });
                oProductsModel.setProperty("/products", aProducts);
            };
            if (oProductsModel.getProperty("/products")) {
                fnFixImages();
            } else {
                oProductsModel.attachRequestCompleted(fnFixImages);
            }

            this.getRouter().initialize();
        }
    });
});
