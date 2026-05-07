sap.ui.define([], function () {
    "use strict";

    return {
        /**
         * Adds a product to the cart (or increments quantity if already present).
         * @param {sap.ui.model.json.JSONModel} oCartModel
         * @param {object} oProduct
         * @param {number} [nQty=1]
         * @param {string} [sVariant="Standard"]
         * @param {string} [sController=""]
         */
        addToCart: function (oCartModel, oProduct, nQty, sVariant, sController) {
            nQty = nQty || 1;
            sVariant = sVariant || "Standard";
            sController = sController || "";

            var aItems = oCartModel.getProperty("/items") || [];
            var oExisting = aItems.find(function (i) { return i.id === oProduct.id; });

            if (oExisting) {
                oExisting.quantity += nQty;
                oExisting.totalPrice = oExisting.quantity * oExisting.price;
            } else {
                aItems.push({
                    id: oProduct.id,
                    name: oProduct.name,
                    price: oProduct.price,
                    image: oProduct.image,
                    quantity: nQty,
                    totalPrice: oProduct.price * nQty,
                    variant: sVariant,
                    controller: sController,
                    manufacturer: oProduct.manufacturer,
                    availability: oProduct.availability
                });
            }

            this._updateTotals(oCartModel, aItems);
        },

        /**
         * Removes an item from the cart by product ID.
         * @param {sap.ui.model.json.JSONModel} oCartModel
         * @param {string} sProductId
         */
        removeFromCart: function (oCartModel, sProductId) {
            var aItems = oCartModel.getProperty("/items") || [];
            aItems = aItems.filter(function (i) { return i.id !== sProductId; });
            this._updateTotals(oCartModel, aItems);
        },

        /**
         * Recalculates and sets total price and item count on the cart model.
         * @param {sap.ui.model.json.JSONModel} oCartModel
         * @param {Array} aItems
         */
        _updateTotals: function (oCartModel, aItems) {
            var nTotal = aItems.reduce(function (s, i) { return s + i.totalPrice; }, 0);
            var nCount = aItems.reduce(function (s, i) { return s + i.quantity; }, 0);
            oCartModel.setProperty("/items", aItems);
            oCartModel.setProperty("/totalPrice", nTotal);
            oCartModel.setProperty("/totalCount", nCount);
        }
    };
});
