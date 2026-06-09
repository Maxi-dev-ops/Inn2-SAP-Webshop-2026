import Controller from "sap/ui/core/mvc/Controller";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import UIComponent from "sap/ui/core/UIComponent";
import MessageToast from "sap/m/MessageToast";
import Log from "sap/base/Log";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Button from "sap/m/Button";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import formatter from "../model/formatter";

export default class ProductDetailController extends Controller {
    public readonly formatter = formatter;

    // -- Lifecycle --

    public onInit(): void {
        // Lokales Modell für Bundle-Sichtbarkeit
        const oDetailModel = new JSONModel({ hasBundleItems: false });
        this.getView().setModel(oDetailModel, "detailModel");

        // Auf Route-Match reagieren
        UIComponent.getRouterFor(this)
            .getRoute("RouteProductDetail")
            .attachPatternMatched(this._onRouteMatched.bind(this));
    }

    /** Liest einen Text aus dem i18n-ResourceBundle, optional mit Platzhaltern {0}, {1}, … */
    private _getText(sKey: string, aArgs?: (string | number)[]): string {
        const oBundle = (this.getOwnerComponent().getModel("i18n") as ResourceModel).getResourceBundle() as ResourceBundle;
        return oBundle.getText(sKey, aArgs);
    }

    // -- Routing --

    private _onRouteMatched(oEvent: Event): void {
        const sUuid = (oEvent.getParameter("arguments") as { catalogItemUuid: string }).catalogItemUuid;

        // OData-Key für Guid-Typ aufbauen
        const sPath = `/CatalogItem(guid'${sUuid}')`;

        this.getView().bindElement({
            path: sPath,
            parameters: {
                expand: "to_BundleItem"
            },
            events: {
                dataReceived: (oEvt: Event) => {
                    this._onDataReceived(oEvt);
                },
                change: () => {
                    this._checkBundleItems(sPath);
                }
            }
        });
    }

    private _onDataReceived(oEvent: Event): void {
        // Prüfen ob Daten vorhanden sind (404-Fall)
        const oData = oEvent.getParameter("data") as { CatalogItemUuid?: string } | undefined;
        if (!oData || !oData.CatalogItemUuid) {
            MessageToast.show(this._getText("productNotFound"));
            UIComponent.getRouterFor(this).navTo("RouteProductList");
        }
    }

    private _checkBundleItems(sPath: string): void {
        // getOwnerComponent().getModel() — nicht getView().getModel()
        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        const oDetailModel = this.getView().getModel("detailModel") as JSONModel;

        // Bundle-Items aus dem expandierten Pfad lesen
        const aBundleItems = oModel.getProperty(`${sPath}/to_BundleItem`) as unknown[] | undefined;
        const bHasBundles = Array.isArray(aBundleItems) && aBundleItems.length > 0;
        oDetailModel.setProperty("/hasBundleItems", bHasBundles);
    }

    // -- Navigation --

    public onNavBack(): void {
        UIComponent.getRouterFor(this).navTo("RouteProductList");
    }

    public onNavHome(): void {
        UIComponent.getRouterFor(this).navTo("RouteHome");
    }

    public onNavToCart(): void {
        UIComponent.getRouterFor(this).navTo("RouteCart");
    }

    public onSearch(oEvent: Event): void {
        const sQuery = (oEvent.getParameter("query") as string) ?? "";
        if (sQuery) {
            UIComponent.getRouterFor(this).navTo("RouteProductList");
        }
    }

    // -- Warenkorb --

    public onAddToCart(): void {
        const oCtx = this.getView().getBindingContext();
        if (!oCtx) {return;}

        const oData = oCtx.getObject() as {
            CatalogItemUuid: string;
            ProductName: string;
            Material: string;
            NetPriceAmount: number;
            TransactionCurrency: string;
            ProductPictureUrl: string;
        };
        const oBtn = this.byId("addToCartBtn") as Button;
        oBtn.setBusy(true);

        const oModel = this.getOwnerComponent().getModel() as ODataModel;
        oModel.callFunction("/addToShoppingCart", {
            method: "POST",
            urlParameters: { CatalogItemUuid: oData.CatalogItemUuid },
            success: () => {
                oBtn.setBusy(false);
                const oCartModel = this.getOwnerComponent()?.getModel("cartModel") as JSONModel | undefined;
                if (oCartModel) {
                    const aItems = oCartModel.getProperty("/items") as Array<{ uuid: string; name: string; material: string; price: number; currency: string; pictureUrl: string; quantity: number }>;
                    const oExisting = aItems.find((i) => i.uuid === oData.CatalogItemUuid);
                    if (oExisting) {
                        oExisting.quantity += 1;
                        oCartModel.setProperty("/items", aItems);
                    } else {
                        aItems.push({
                            uuid: oData.CatalogItemUuid,
                            name: oData.ProductName,
                            material: oData.Material,
                            price: oData.NetPriceAmount,
                            currency: oData.TransactionCurrency,
                            pictureUrl: oData.ProductPictureUrl,
                            quantity: 1
                        });
                        oCartModel.setProperty("/items", aItems);
                    }
                    oCartModel.setProperty("/count", aItems.reduce((s: number, i: { quantity: number }) => s + i.quantity, 0));
                }
                MessageToast.show(this._getText("addedToCart", [oData.ProductName]));
            },
            error: (oErr: unknown) => {
                oBtn.setBusy(false);
                const sResp = (oErr as { responseText?: string })?.responseText ?? "";
                Log.error("addToShoppingCart error", sResp);
                let sMsg = this._getText("addToCartError");
                try {
                    // Versuche JSON-Response
                    const oResp = JSON.parse(sResp) as { error?: { message?: { value?: string } } };
                    sMsg = oResp?.error?.message?.value ?? sMsg;
                } catch {
                    // Versuche XML-Response (SAP OData V2 Standard)
                    const oMatch = sResp.match(/<message[^>]*>([^<]+)<\/message>/i);
                    if (oMatch?.[1]) {sMsg = oMatch[1];}
                }
                MessageToast.show(sMsg);
            }
        });
    }

    // -- Bilder --

    public onImageError(oEvent: Event): void {
        (oEvent.getSource() as Control).addStyleClass("webshopImageBroken");
    }

    public onBundleImageError(oEvent: Event): void {
        (oEvent.getSource() as Control).addStyleClass("webshopImageBroken");
    }

    // -- Downloads --

    public onDownload(): void {
        const oCtx = this.getView().getBindingContext();
        if (!oCtx) {
            MessageToast.show(this._getText("productDataNotLoaded"));
            return;
        }

        const oData = oCtx.getObject() as {
            ProductName?: string;
            Material?: string;
            NetPriceAmount?: number;
            TransactionCurrency?: string;
            ProductSalesDescription?: string;
            ProductPictureUrl?: string;
        };

        const sName   = oData.ProductName ?? "–";
        const sMat    = oData.Material ?? "–";
        const sPrice  = oData.NetPriceAmount !== undefined && oData.NetPriceAmount !== null
            ? `${Number(oData.NetPriceAmount).toFixed(2)} ${oData.TransactionCurrency ?? ""}`
            : "–";
        const sDesc   = oData.ProductSalesDescription ?? "";
        const sImgSrc = oData.ProductPictureUrl ?? "";

        // Lokalisierte Texte für das (clientseitig erzeugte) HTML-Datenblatt
        const sTitle       = this._getText("datasheetTitle", [sName]);
        const sSubtitle    = this._getText("datasheetSubtitle");
        const sArticleNo   = this._getText("datasheetArticleNo");
        const sListPrice   = this._getText("datasheetListPrice");
        const sDescHeading = this._getText("datasheetDescription");

        const sHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${sTitle}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #1a2b4a; }
  h1   { font-size: 1.6rem; margin-bottom: 4px; }
  .sub { color: #6b7280; font-size: 0.85rem; margin-bottom: 24px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
  td   { padding: 8px 12px; border: 1px solid #e2e8f0; }
  td:first-child { font-weight: 600; width: 180px; background: #f8fafc; }
  img  { max-width: 280px; max-height: 280px; object-fit: contain; display: block; margin: 0 auto 24px; }
  .desc { font-size: 0.9rem; line-height: 1.6; color: #374151; }
  @media print { button { display: none; } }
</style>
</head>
<body>
${sImgSrc ? `<img src="${sImgSrc}" alt="${sName}"/>` : ""}
<h1>${sName}</h1>
<div class="sub">${sSubtitle}</div>
<table>
  <tr><td>${sArticleNo}</td><td>${sMat}</td></tr>
  <tr><td>${sListPrice}</td><td>${sPrice}</td></tr>
</table>
${sDesc ? `<div class="desc"><strong>${sDescHeading}</strong><p>${sDesc}</p></div>` : ""}
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`;

        const oWin = window.open("", "_blank", "width=700,height=900");
        if (oWin) {
            oWin.document.write(sHtml);
            oWin.document.close();
        } else {
            MessageToast.show(this._getText("popupBlocked"));
        }
    }
}
