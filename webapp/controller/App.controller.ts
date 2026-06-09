import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import UIComponent from "sap/ui/core/UIComponent";
import CartService from "../model/CartService";

/**
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class App extends Controller {

    public onInit(): void {
        const oComponent = this.getOwnerComponent() as UIComponent;

        // App-weites Warenkorb-Model anlegen, damit das Badge im Shell-Header
        // jeder Seite an cartModel>/count binden kann.
        const oCartModel = new JSONModel({
            count: 0,
            items: [],
            totalAmount: 0,
            totalCurrency: "EUR",
            cartUuid: "",
            loading: true
        });
        oComponent.setModel(oCartModel, "cartModel");

        // Warenkorb beim App-Start vorladen — Badge ist sofort korrekt und der
        // erste Klick auf den Warenkorb reagiert ohne Ladewartezeit.
        // (Die Logik liegt bewusst hier im Root-View-Controller statt in der
        //  Component, damit die Component schlank bleibt.)
        new CartService(oComponent).preload();
    }
}
