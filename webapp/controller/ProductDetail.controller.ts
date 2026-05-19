import Controller from "sap/ui/core/mvc/Controller";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import UIComponent from "sap/ui/core/UIComponent";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import formatter from "../model/formatter";

export default class ProductDetailController extends Controller {
    public readonly formatter = formatter;

    // ─── Lifecycle ─────────────────────────────────────────────────────────────

    public onInit(): void {
        // Lokales Modell für Bundle-Sichtbarkeit
        const oDetailModel = new JSONModel({ hasBundleItems: false });
        this.getView()!.setModel(oDetailModel, "detailModel");

        // Auf Route-Match reagieren
        UIComponent.getRouterFor(this)
            .getRoute("RouteProductDetail")!
            .attachPatternMatched(this._onRouteMatched, this);
    }

    // ─── Routing ───────────────────────────────────────────────────────────────

    private _onRouteMatched(oEvent: Event): void {
        const sUuid = (oEvent.getParameter("arguments") as { catalogItemUuid: string }).catalogItemUuid;

        // OData-Key für Guid-Typ aufbauen
        const sPath = `/CatalogItem(guid'${sUuid}')`;

        this.getView()!.bindElement({
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
            MessageToast.show("Produkt nicht gefunden");
            UIComponent.getRouterFor(this).navTo("RouteProductList");
        }
    }

    private _checkBundleItems(sPath: string): void {
        // getOwnerComponent().getModel() — nicht getView().getModel()
        const oModel = this.getOwnerComponent()!.getModel() as ODataModel;
        const oDetailModel = this.getView()!.getModel("detailModel") as JSONModel;

        // Bundle-Items aus dem expandierten Pfad lesen
        const aBundleItems = oModel.getProperty(`${sPath}/to_BundleItem`) as unknown[] | undefined;
        const bHasBundles = Array.isArray(aBundleItems) && aBundleItems.length > 0;
        oDetailModel.setProperty("/hasBundleItems", bHasBundles);
    }

    // ─── Navigation ───────────────────────────────────────────────────────────

    public onNavBack(): void {
        UIComponent.getRouterFor(this).navTo("RouteProductList");
    }

    public onNavHome(): void {
        UIComponent.getRouterFor(this).navTo("RouteProductList");
    }

    public onSearch(oEvent: Event): void {
        const sQuery = (oEvent.getParameter("query") as string) ?? "";
        if (sQuery) {
            UIComponent.getRouterFor(this).navTo("RouteProductList");
        }
    }

    // ─── Warenkorb ─────────────────────────────────────────────────────────────

    public onAddToCart(): void {
        const oCtx = this.getView()!.getBindingContext();
        if (!oCtx) return;

        const oData = oCtx.getObject() as { CatalogItemUuid: string; ProductName: string };
        const oBtn = this.byId("addToCartBtn") as any;
        oBtn.setBusy(true);

        // getOwnerComponent().getModel() — nicht getView().getModel()
        const oModel = this.getOwnerComponent()!.getModel() as ODataModel;
        oModel.callFunction("/addToShoppingCart", {
            method: "POST",
            urlParameters: { CatalogItemUuid: oData.CatalogItemUuid },
            success: () => {
                oBtn.setBusy(false);
                const oCartModel = this.getOwnerComponent()?.getModel("cartModel") as JSONModel | undefined;
                if (oCartModel) {
                    const nCount = (oCartModel.getProperty("/count") as number) + 1;
                    oCartModel.setProperty("/count", nCount);
                }
                MessageToast.show(`„${oData.ProductName}" wurde in den Warenkorb gelegt`);
            },
            error: () => {
                oBtn.setBusy(false);
                MessageToast.show("Fehler beim Hinzufügen zum Warenkorb");
            }
        });
    }

    // ─── Bilder ───────────────────────────────────────────────────────────────

    public onImageError(oEvent: Event): void {
        (oEvent.getSource() as any).addStyleClass("webshopImageBroken");
    }

    public onBundleImageError(oEvent: Event): void {
        (oEvent.getSource() as any).addStyleClass("webshopImageBroken");
    }

    // ─── Downloads ────────────────────────────────────────────────────────────

    public onDownload(): void {
        const oCtx = this.getView()!.getBindingContext();
        if (!oCtx) {
            MessageToast.show("Produktdaten noch nicht geladen");
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
        const sPrice  = oData.NetPriceAmount != null
            ? `${Number(oData.NetPriceAmount).toFixed(2)} ${oData.TransactionCurrency ?? ""}`
            : "–";
        const sDesc   = oData.ProductSalesDescription ?? "";
        const sImgSrc = oData.ProductPictureUrl ?? "";

        const sHtml = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<title>Datenblatt – ${sName}</title>
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
<div class="sub">Inn2 Shop – Produktdatenblatt</div>
<table>
  <tr><td>Artikelnummer</td><td>${sMat}</td></tr>
  <tr><td>Listenpreis (netto)</td><td>${sPrice}</td></tr>
</table>
${sDesc ? `<div class="desc"><strong>Beschreibung</strong><p>${sDesc}</p></div>` : ""}
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`;

        const oWin = window.open("", "_blank", "width=700,height=900");
        if (oWin) {
            oWin.document.write(sHtml);
            oWin.document.close();
        } else {
            MessageToast.show("Popup wurde blockiert – bitte Popup-Blocker deaktivieren");
        }
    }
}
