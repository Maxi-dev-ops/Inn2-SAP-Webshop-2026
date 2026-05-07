sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast"
], function (Controller, MessageToast) {
    "use strict";

    return Controller.extend("sapwebshop.controller.Notifications", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("Notifications").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {},

        onTabSelect: function () {},

        onMarkAllRead: function () {
            MessageToast.show("Alle Benachrichtigungen als gelesen markiert.");
        },

        onDismissNotif: function () {
            MessageToast.show("Benachrichtigung entfernt.");
        },

        onNavBack: function () { window.history.go(-1); },
        onNavHome: function () { this.getOwnerComponent().getRouter().navTo("Home"); },
        onCartPress: function () { this.getOwnerComponent().getRouter().navTo("Cart"); },
        onWishlistPress: function () { this.getOwnerComponent().getRouter().navTo("Wishlist"); },
        onNotificationsPress: function () {},
        onUserPress: function () { this.getOwnerComponent().getRouter().navTo("Profile"); },
        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            if (sQuery) {
                this.getOwnerComponent().getRouter().navTo("ProductList", { category: "search:" + encodeURIComponent(sQuery) });
            }
        }
    });
});
