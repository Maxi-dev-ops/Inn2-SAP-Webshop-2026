import ResourceBundle from "sap/base/i18n/ResourceBundle";
import NumberFormat from "sap/ui/core/format/NumberFormat";
import WishlistService from "./WishlistService";

export default class Formatter {

    private static oI18n: ResourceBundle | undefined;
    private static oCurrencyFormat: NumberFormat | undefined;

    /** Injected once so formatters reuse the app's i18n bundle */
    public static setBundle(oBundle: ResourceBundle): void {
        Formatter.oI18n = oBundle;
    }

    private static getText(sKey: string, aArgs?: (string | number)[]): string {
        return (Formatter.oI18n ? Formatter.oI18n.getText(sKey, aArgs) : undefined) ?? sKey;
    }

    public static formatPrice(amount: number | string | null | undefined, currency: string | null | undefined): string {
        const nAmount = typeof amount === "string" ? parseFloat(amount) : amount;
        if (nAmount === null || nAmount === undefined || isNaN(nAmount) || nAmount === 0) {
            return Formatter.getText("priceOnRequest");
        }
        if (!Formatter.oCurrencyFormat) {
            Formatter.oCurrencyFormat = NumberFormat.getCurrencyInstance();
        }
        return Formatter.oCurrencyFormat.format(nAmount, currency ?? "EUR");
    }

    public static formatLinePrice(
        amount: number | string | null | undefined,
        currency: string | null | undefined,
        quantity: number | null | undefined
    ): string {
        const nAmount = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
        const nQty = typeof quantity === "number" ? quantity : 1;
        return Formatter.formatPrice(nAmount * nQty, currency);
    }

    public static formatUnitLine(
        amount: number | string | null | undefined,
        currency: string | null | undefined,
        quantity: number | null | undefined
    ): string {
        const nQty = typeof quantity === "number" ? quantity : 1;
        if (nQty <= 1) {return "";}
        return `${nQty} × ${Formatter.formatPrice(amount, currency)}`;
    }

    public static formatCartTotal(oCart: { items?: Array<{ price: number; currency: string; quantity: number }>; totalAmount?: number; totalCurrency?: string } | null | undefined): string {
        if (oCart?.totalAmount && oCart.totalAmount > 0) {
            return Formatter.formatPrice(oCart.totalAmount, oCart.totalCurrency ?? "EUR");
        }
        if (!oCart?.items?.length) {return Formatter.formatPrice(0, "EUR");}
        const aPriced = oCart.items.filter((i) => i.price > 0);
        if (!aPriced.length) {return Formatter.getText("priceOnRequest");}
        const sCurrency = aPriced[0]?.currency ?? "EUR";
        const nTotal = aPriced.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0);
        return Formatter.formatPrice(nTotal, sCurrency);
    }

    public static formatPricedCount(oCart: { items?: Array<{ price: number; quantity: number }> } | null | undefined): string {
        if (!oCart?.items?.length) {return "0";}
        const n = oCart.items.filter((i) => i.price > 0).reduce((s, i) => s + (i.quantity ?? 1), 0);
        return String(n);
    }

    public static formatUnpricedCount(oCart: { items?: Array<{ price: number; quantity: number }> } | null | undefined): string {
        if (!oCart?.items?.length) {return Formatter.getText("unpricedCount", [0]);}
        const n = oCart.items.filter((i) => !i.price || i.price === 0).reduce((s, i) => s + (i.quantity ?? 1), 0);
        return Formatter.getText("unpricedCount", [n]);
    }

    public static hasUnpricedItems(oCart: { items?: Array<{ price: number }> } | null | undefined): boolean {
        if (!oCart?.items?.length) {return false;}
        return oCart.items.some((i) => !i.price || i.price === 0);
    }

    public static formatHeartIcon(sUuid: string | null | undefined): string {
        return WishlistService.has(sUuid ?? "") ? "sap-icon://heart" : "sap-icon://heart-2";
    }
}
