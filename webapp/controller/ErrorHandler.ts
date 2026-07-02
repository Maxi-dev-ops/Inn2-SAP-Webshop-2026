import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import MessageBox from "sap/m/MessageBox";
import UIComponent from "sap/ui/core/UIComponent";
import Constants from "../model/Constants";

/**
 * Shows dialog when the OData service or its $metadata is unreachable (usually an expired SAP session)
 * 
 * @namespace com.sapwebshop2026.sapwebshop.controller
 */
export default class ErrorHandler {
    private readonly _oComponent: UIComponent;
    private readonly _aModels: ODataModel[] = [];
    private _bMessageOpen = false;
    private readonly _fnFatalError = () => { this._onFatalError(); };

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

    private _onFatalError(): void {
        if (this._bMessageOpen) { return; }
        this._bMessageOpen = true;

        const oBundle = (this._oComponent.getModel(Constants.MODELS.I18N) as ResourceModel).getResourceBundle();
        const fnShow = (oResolved: ResourceBundle): void => {
            MessageBox.error(oResolved.getText("serviceErrorText") ?? "", {
                id: "serviceErrorMessageBox",
                title: oResolved.getText("serviceErrorTitle") ?? "",
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
