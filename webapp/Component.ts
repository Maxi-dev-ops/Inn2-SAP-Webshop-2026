import BaseComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { createDeviceModel } from "./model/models";
import Formatter from "./model/formatter";
import ErrorHandler from "./controller/ErrorHandler";

/**
 * @namespace com.sapwebshop2026.sapwebshop
 */
export default class Component extends BaseComponent {

	public static metadata = {
		manifest: "json"
	};

	private _oErrorHandler?: ErrorHandler;

	public init() : void {
		super.init();

		// Central handler for fatal OData errors (service/metadata unreachable)
		this._oErrorHandler = new ErrorHandler(this);

		// Reuse the already-loaded i18n bundle in the formatter
		const oBundle = (this.getModel("i18n") as ResourceModel).getResourceBundle();
		if (oBundle instanceof Promise) {
			void oBundle.then((oResolved: ResourceBundle) => Formatter.setBundle(oResolved));
		} else {
			Formatter.setBundle(oBundle);
		}

		this.getRouter().initialize();
		this.setModel(createDeviceModel(), "device");

        // Demo mode shows placeholder data
        const demoMode = new URLSearchParams(window.location.search).get("demo") === "true";
        const oConfigModel = new JSONModel({
            demoMode: demoMode,
            customerName: demoMode ? "Demo GmbH" : "",
            customerLogo: sap.ui.require.toUrl("com/sapwebshop2026/sapwebshop/images/customer-logo.png")
        });
        this.setModel(oConfigModel, "config");
	}

	public exit(): void {
		this._oErrorHandler?.destroy();
	}
}
