import ResourceBundle from "sap/base/i18n/ResourceBundle";
import NumberFormat from "sap/ui/core/format/NumberFormat";
import CartService, { CartState } from "./CartService";

export default class Formatter {

    private static oI18n: ResourceBundle | undefined;
    private static oCurrencyFormat: NumberFormat | undefined;

    // Injected once so formatters reuse the i18n bundle
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

    public static formatCartTotal(oCart: CartState | null | undefined): string {
        const oTotals = CartService.calcTotals(oCart);
        return Formatter.formatPrice(oTotals.amount, oTotals.currency);
    }

    public static formatPricedCount(oCart: CartState | null | undefined): string {
        return String(CartService.calcTotals(oCart).pricedCount);
    }

    public static formatUnpricedCount(oCart: CartState | null | undefined): string {
        return Formatter.getText("unpricedCount", [CartService.calcTotals(oCart).unpricedCount]);
    }

    public static hasUnpricedItems(oCart: CartState | null | undefined): boolean {
        return CartService.calcTotals(oCart).unpricedCount > 0;
    }

    // Note on the order confirmation explaining why the item count exceeds the priced amount
    public static formatOrderUnpriced(nCount: number | string | null | undefined): string {
        const n = typeof nCount === "string" ? parseInt(nCount, 10) : (nCount ?? 0);
        return Formatter.getText("orderConfirmUnpriced", [isNaN(n) ? 0 : n]);
    }
}
