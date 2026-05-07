sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("sapwebshop.controller.Profile", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("Profile").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {},

        onOrderHistoryPress: function () {
            this.getOwnerComponent().getRouter().navTo("OrderHistory");
        },

        onSupportPress: function () {
            this.getOwnerComponent().getRouter().navTo("Support");
        },

        onLogout: function () {
            MessageBox.confirm("Möchten Sie sich wirklich abmelden?", {
                title: "Abmelden",
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        MessageToast.show("Sie wurden abgemeldet.");
                        this.getOwnerComponent().getRouter().navTo("Home");
                    }
                }.bind(this)
            });
        },

        onNavBack: function () { window.history.go(-1); },
        onNavHome: function () { this.getOwnerComponent().getRouter().navTo("Home"); },
        onUserPress: function () {},
        onCartPress: function () { this.getOwnerComponent().getRouter().navTo("Cart"); },
        onWishlistPress: function () { this.getOwnerComponent().getRouter().navTo("Wishlist"); },
        onNotificationsPress: function () { this.getOwnerComponent().getRouter().navTo("Notifications"); },
        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            if (sQuery) {
                this.getOwnerComponent().getRouter().navTo("ProductList", { category: "search:" + encodeURIComponent(sQuery) });
            }
        }
    });
});
