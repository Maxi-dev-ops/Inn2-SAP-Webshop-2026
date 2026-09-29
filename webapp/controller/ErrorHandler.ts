import ODataModel, { type ODataModel$MetadataFailedEvent } from "sap/ui/model/odata/v2/ODataModel";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import MessageBox from "sap/m/MessageBox";
import UIComponent from "sap/ui/core/UIComponent";
import Constants from "../model/Constants";

/**
 * Shows a dialog when an OData service or its metadata is unreachable
 *
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class ErrorHandler {
    private readonly _oComponent: UIComponent;
    private readonly _aModels: ODataModel[] = [];
    private _bMessageOpen = false;
    private readonly _fnFatalError = (oEvent: ODataModel$MetadataFailedEvent) => { this._onFatalError(oEvent); };

    public constructor(oComponent: UIComponent) {
        this._oComponent = oComponent;
        this._register(oComponent.getModel() as ODataModel | undefined);
        this._register(oComponent.getModel(Constants.MODELS.CART_SERVICE) as ODataModel | undefined);
    }

    private _register(oModel?: ODataModel): void {
        if (!oModel) { return; }
        oModel.attachMetadataFailed(this._fnFatalError);
        this._aModels.push(oModel);
    }

    private _onFatalError(oEvent: ODataModel$MetadataFailedEvent): void {
        if (this._bMessageOpen) { return; }
        this._bMessageOpen = true;

        // 401 and 403 are not a broken connection: the user simply has no authorization for the service 
        const sStatus = String(oEvent.getParameter("statusCode") ?? "");
        const bDenied = sStatus === "401" || sStatus === "403";

        const oBundle = (this._oComponent.getModel(Constants.MODELS.I18N) as ResourceModel).getResourceBundle();
        const fnShow = (oResolved: ResourceBundle): void => {
            const sTitle = bDenied
                ? oResolved.getText("serviceForbiddenTitle")
                : oResolved.getText("serviceErrorTitle");
            const sText = bDenied
                ? oResolved.getText("serviceForbiddenText")
                : oResolved.getText("serviceErrorText");
            MessageBox.error(sText ?? "", {
                id: "serviceErrorMessageBox",
                title: sTitle ?? "",
                onClose: () => { this._bMessageOpen = false; }
            });
        };
        if (oBundle instanceof Promise) {
            void oBundle.then(fnShow);
        } else {
            fnShow(oBundle);
        }
    }

    public destroy(): void {
        this._aModels.forEach((oModel) => oModel.detachMetadataFailed(this._fnFatalError));
        this._aModels.length = 0;
    }
}
