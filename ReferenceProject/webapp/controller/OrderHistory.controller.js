sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("sapwebshop.controller.OrderHistory", {

        onInit: function () {
            this._oFilteredModel = new JSONModel({ orders: [] });
            this.getView().setModel(this._oFilteredModel, "filteredOrders");
            this._sTimeFilter = "all";
            this._sStatusFilter = "all";
            this._sSearchQuery = "";

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("OrderHistory").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._applyFilters();
        },

        _applyFilters: function () {
            var oModel = this.getOwnerComponent().getModel("orders");
            var fnFilter = function () {
                var aAll = oModel.getProperty("/orders") || [];
                var aFiltered = aAll.filter(function (o) {
                    if (this._sTimeFilter !== "all" && !o.date.includes(this._sTimeFilter)) return false;
                    if (this._sStatusFilter !== "all" && o.status !== this._sStatusFilter) return false;
                    if (this._sSearchQuery && !o.orderId.toLowerCase().includes(this._sSearchQuery.toLowerCase())) return false;
                    return true;
                }.bind(this));
                this._oFilteredModel.setProperty("/orders", aFiltered);
                this._updateStats(aAll);
            }.bind(this);

            if (oModel.getProperty("/orders")) {
                fnFilter();
            } else {
                oModel.attachRequestCompleted(fnFilter);
            }
        },

        _updateStats: function (aAll) {
            var nTotal = aAll.length;
            var nRevenue = aAll.reduce(function (s, o) { return s + o.totalPrice; }, 0);
            var nDelivered = aAll.filter(function (o) { return o.status === "Geliefert"; }).length;
            var oCount = this.byId("totalOrdersCount");
            if (oCount) oCount.setText(nTotal);
            var oRev = this.byId("totalRevenue");
            if (oRev) oRev.setText("€ " + nRevenue.toLocaleString("de-DE", { minimumFractionDigits: 0 }));
            var oDel = this.byId("deliveredCount");
            if (oDel) oDel.setText(nDelivered);
        },

        onTimeFilterChange: function (oEvent) {
            this._sTimeFilter = oEvent.getParameter("selectedItem").getKey();
            this._applyFilters();
        },

        onStatusFilterChange: function (oEvent) {
            this._sStatusFilter = oEvent.getParameter("selectedItem").getKey();
            this._applyFilters();
        },

        onSearch: function (oEvent) {
            this._sSearchQuery = oEvent.getParameter("query") || "";
            this._applyFilters();
        },

        onOrderPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("filteredOrders");
            if (oCtx) {
                var sId = oCtx.getProperty("orderId");
                MessageToast.show("Bestelldetails für: " + sId);
            }
        },

        onOrderAction: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("filteredOrders");
            if (oCtx) {
                var sStatus = oCtx.getProperty("status");
                if (sStatus === "Geliefert") {
                    MessageToast.show("Produkte werden erneut bestellt...");
                } else if (sStatus === "Versandt") {
                    MessageToast.show("Tracking-Link wird geöffnet...");
                }
            }
        },

        formatPrice: function (nPrice) {
            return nPrice ? nPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "";
        },

        formatFirstItem: function (aItems) {
            if (!aItems || aItems.length === 0) return "";
            return aItems[0].name;
        },

        formatMoreItems: function (aItems) {
            if (!aItems || aItems.length <= 1) return "";
            return "+ " + (aItems.length - 1) + " weitere" + (aItems.length - 1 === 1 ? "s Produkt" : " Produkte");
        },

        formatActionBtn: function (sStatus) {
            if (sStatus === "Geliefert") return "Erneut bestellen";
            if (sStatus === "Versandt") return "Tracking";
            return "";
        },

        formatActionBtnVisible: function (sStatus) {
            return sStatus === "Geliefert" || sStatus === "Versandt";
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
        }
    });
});
