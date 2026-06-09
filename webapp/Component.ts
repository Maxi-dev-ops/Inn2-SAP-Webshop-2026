import BaseComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";
import { createDeviceModel } from "./model/models";

/**
 * @namespace com.sapwebshop2026.sapwebshop
 */
export default class Component extends BaseComponent {

	public static metadata = {
		manifest: "json"
	};

    /**
     * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
     * @public
     * @override
     */
	public init() : void {
		// call the base component's init function
		super.init();

        // enable routing
        this.getRouter().initialize();

        // set the device model
        this.setModel(createDeviceModel(), "device");

        // Customer/white-label config — swap customerLogo (drop a file in webapp/images/)
        // and customerName to re-brand the shop per customer.
        // toUrl resolves against the app namespace, so the image loads both standalone
        // (index.html at /) and in the FLP sandbox (flp.html under /test/).
        const oConfigModel = new JSONModel({
            customerName: "Maxis Backstube",
            customerLogo: sap.ui.require.toUrl("com/sapwebshop2026/sapwebshop/images/customer-logo.png")
        });
        this.setModel(oConfigModel, "config");

        // Hinweis: Das cartModel und der Cart-Preload werden im Root-View-Controller
        // (controller/App.controller.ts) über model/CartService.ts angelegt/gestartet.
	}
}
