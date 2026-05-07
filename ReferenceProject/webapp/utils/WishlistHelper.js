sap.ui.define([], function () {
    "use strict";

    return {
        /**
         * Checks whether a product is currently on the wishlist.
         * @param {sap.ui.model.json.JSONModel} oWishlistModel
         * @param {string} sProductId
         * @returns {boolean}
         */
        isInWishlist: function (oWishlistModel, sProductId) {
            var aItems = oWishlistModel.getProperty("/items") || [];
            return aItems.some(function (i) { return i.id === sProductId; });
        },

        /**
         * Adds a product to the wishlist if not already present.
         * Returns true if added, false if already there.
         * @param {sap.ui.model.json.JSONModel} oWishlistModel
         * @param {object} oProduct
         * @returns {boolean}
         */
        addToWishlist: function (oWishlistModel, oProduct) {
            var aItems = oWishlistModel.getProperty("/items") || [];
            if (aItems.some(function (i) { return i.id === oProduct.id; })) {
                return false;
            }
            aItems.push(oProduct);
            oWishlistModel.setProperty("/items", aItems);
            return true;
        },

        /**
         * Removes a product from the wishlist.
         * @param {sap.ui.model.json.JSONModel} oWishlistModel
         * @param {string} sProductId
         */
        removeFromWishlist: function (oWishlistModel, sProductId) {
            var aItems = oWishlistModel.getProperty("/items") || [];
            aItems = aItems.filter(function (i) { return i.id !== sProductId; });
            oWishlistModel.setProperty("/items", aItems);
        },

        /**
         * Toggles a product on/off the wishlist.
         * Returns true if added, false if removed.
         * @param {sap.ui.model.json.JSONModel} oWishlistModel
         * @param {object} oProduct
         * @returns {boolean}
         */
        toggle: function (oWishlistModel, oProduct) {
            if (this.isInWishlist(oWishlistModel, oProduct.id)) {
                this.removeFromWishlist(oWishlistModel, oProduct.id);
                return false;
            } else {
                this.addToWishlist(oWishlistModel, oProduct);
                return true;
            }
        }
    };
});
