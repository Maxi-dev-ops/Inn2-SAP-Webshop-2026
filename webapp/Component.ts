import BaseComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { createDeviceModel } from "./model/models";
import Formatter from "./model/formatter";
import Constants from "./model/Constants";
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

		// Central handler for fatal OData errors
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

		// Customer branding of the start page
		this.setModel(new JSONModel({
			customerLogo: sap.ui.require.toUrl("com/sapwebshop2026/sapwebshop/images/customer-logo.png")
		}), Constants.MODELS.CONFIG);
	}

	public exit(): void {
		this._oErrorHandler?.destroy();
	}
}
