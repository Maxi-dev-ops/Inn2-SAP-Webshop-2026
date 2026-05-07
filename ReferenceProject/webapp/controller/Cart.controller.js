sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("sapwebshop.controller.Cart", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("Cart").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._updateSummary();
        },

        _updateSummary: function () {
            var oCartModel = this.getOwnerComponent().getModel("cart");
            var aItems = oCartModel.getProperty("/items") || [];
            var nNet = aItems.reduce(function (s, i) { return s + i.totalPrice; }, 0);
            var nVat = nNet * 0.19;
            var nGross = nNet + nVat;

            var oTitle = this.byId("cartTitle");
            var nCount = aItems.reduce(function (s, i) { return s + i.quantity; }, 0);
            if (oTitle) oTitle.setText("Warenkorb (" + nCount + " " + (nCount === 1 ? "Artikel" : "Artikel") + ")");

            var oVat = this.byId("vatText");
            if (oVat) oVat.setText("€ " + nVat.toLocaleString("de-DE", { minimumFractionDigits: 2 }));
            var oGrand = this.byId("grandTotalText");
            if (oGrand) oGrand.setText("€ " + nGross.toLocaleString("de-DE", { minimumFractionDigits: 2 }));
        },

        onIncreaseQty: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("cart");
            var oCartModel = this.getOwnerComponent().getModel("cart");
            var sPath = oCtx.getPath();
            var nQty = oCartModel.getProperty(sPath + "/quantity") + 1;
            var nPrice = oCartModel.getProperty(sPath + "/price");
            oCartModel.setProperty(sPath + "/quantity", nQty);
            oCartModel.setProperty(sPath + "/totalPrice", nQty * nPrice);
            this._recalcTotals();
            this._updateSummary();
        },

        onDecreaseQty: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("cart");
            var oCartModel = this.getOwnerComponent().getModel("cart");
            var sPath = oCtx.getPath();
            var nQty = oCartModel.getProperty(sPath + "/quantity");
            if (nQty <= 1) return;
            nQty -= 1;
            var nPrice = oCartModel.getProperty(sPath + "/price");
            oCartModel.setProperty(sPath + "/quantity", nQty);
            oCartModel.setProperty(sPath + "/totalPrice", nQty * nPrice);
            this._recalcTotals();
            this._updateSummary();
        },

        onRemoveItem: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("cart");
            var oCartModel = this.getOwnerComponent().getModel("cart");
            var aItems = oCartModel.getProperty("/items");
            var sPath = oCtx.getPath();
            var nIdx = parseInt(sPath.replace("/items/", ""), 10);
            aItems.splice(nIdx, 1);
            oCartModel.setProperty("/items", aItems);
            this._recalcTotals();
            this._updateSummary();
            MessageToast.show("Artikel entfernt.");
        },

        onMoveToWishlist: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("cart");
            var oCartModel = this.getOwnerComponent().getModel("cart");
            var oWishlistModel = this.getOwnerComponent().getModel("wishlist");
            var sPath = oCtx.getPath();
            var oItem = oCartModel.getProperty(sPath);
            var aItems = oCartModel.getProperty("/items");
            var nIdx = parseInt(sPath.replace("/items/", ""), 10);

            var aWish = oWishlistModel.getProperty("/items") || [];
            if (!aWish.some(function (i) { return i.id === oItem.id; })) {
                aWish.push(oItem);
                oWishlistModel.setProperty("/items", aWish);
            }
            aItems.splice(nIdx, 1);
            oCartModel.setProperty("/items", aItems);
            this._recalcTotals();
            this._updateSummary();
            MessageToast.show(oItem.name + " auf Wunschliste verschoben.");
        },

        _recalcTotals: function () {
            var oCartModel = this.getOwnerComponent().getModel("cart");
            var aItems = oCartModel.getProperty("/items") || [];
            var nTotal = aItems.reduce(function (s, i) { return s + i.totalPrice; }, 0);
            var nCount = aItems.reduce(function (s, i) { return s + i.quantity; }, 0);
            oCartModel.setProperty("/totalPrice", nTotal);
            oCartModel.setProperty("/totalCount", nCount);
        },

        onClearCart: function () {
            MessageBox.confirm("Möchten Sie den Warenkorb wirklich leeren?", {
                title: "Warenkorb leeren",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        var oCartModel = this.getOwnerComponent().getModel("cart");
                        oCartModel.setProperty("/items", []);
                        oCartModel.setProperty("/totalPrice", 0);
                        oCartModel.setProperty("/totalCount", 0);
                        this._updateSummary();
                    }
                }.bind(this)
            });
        },

        onCheckout: function () {
            var oCartModel = this.getOwnerComponent().getModel("cart");
            var aItems = oCartModel.getProperty("/items") || [];
            if (aItems.length === 0) {
                MessageToast.show("Ihr Warenkorb ist leer.");
                return;
            }
            MessageBox.success("Ihre Bestellung wurde aufgegeben!\nBestellnummer: BE-2026-" + Math.floor(Math.random() * 90000 + 10000), {
                title: "Bestellung erfolgreich",
                onClose: function () {
                    oCartModel.setProperty("/items", []);
                    oCartModel.setProperty("/totalPrice", 0);
                    oCartModel.setProperty("/totalCount", 0);
                    this.getOwnerComponent().getRouter().navTo("OrderHistory");
                }.bind(this)
            });
        },

        onRedeemVoucher: function () {
            var sCode = this.byId("voucherInput").getValue();
            if (sCode) {
                MessageToast.show("Gutscheincode '" + sCode + "' ist ungültig.");
            }
        },

        onContinueShopping: function () {
            this.getOwnerComponent().getRouter().navTo("ProductList", { category: "all" });
        },

        onNavBack: function () {
            window.history.go(-1);
        },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

        onCartPress: function () {},
        onWishlistPress: function () { this.getOwnerComponent().getRouter().navTo("Wishlist"); },
        onNotificationsPress: function () { this.getOwnerComponent().getRouter().navTo("Notifications"); },
        onUserPress: function () { this.getOwnerComponent().getRouter().navTo("Profile"); },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            if (sQuery) {
                this.getOwnerComponent().getRouter().navTo("ProductList", { category: "search:" + encodeURIComponent(sQuery) });
            }
        },

        formatCurrency: function (nValue) {
            return nValue !== undefined ? "€ " + nValue.toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "";
        },

        formatSummaryLabel: function (sName, nQty) {
            return sName + " × " + nQty;
        }
    });
});
