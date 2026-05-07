sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast"
], function (Controller, MessageToast) {
    "use strict";

    return Controller.extend("sapwebshop.controller.Support", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("Support").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {},

        onCallSupport: function () {
            MessageToast.show("Verbindung wird hergestellt: +49 800 727-62626");
        },

        onEmailSupport: function () {
            MessageToast.show("E-Mail-Client wird geöffnet...");
        },

        onStartChat: function () {
            MessageToast.show("Live-Chat wird gestartet...");
        },

        onNavBack: function () { window.history.go(-1); },
        onNavHome: function () { this.getOwnerComponent().getRouter().navTo("Home"); },
        onUserPress: function () { this.getOwnerComponent().getRouter().navTo("Profile"); },
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
