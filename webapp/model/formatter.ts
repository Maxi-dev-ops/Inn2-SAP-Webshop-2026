import ResourceBundle from "sap/base/i18n/ResourceBundle";

/**
 * Formatter-Funktionen für den Inn2 Webshop.
 * Werden in XML-Views als .formatter.xxx referenziert.
 *
 * Als Klasse mit statischen Methoden umgesetzt (kein Modul-Top-Level-State),
 * damit es keine "globalen" Variablen gibt. Der Formatter hat keinen
 * Component-/View-Kontext, daher lädt er das i18n-Bundle einmalig selbst —
 * so bleiben auch "Preis auf Anfrage" / "{0} Artikel" mehrsprachig.
 * Locale & Fallback spiegeln das i18n-Model der manifest.json.
 */
export default class Formatter {

    private static oI18n: ResourceBundle | undefined;

    private static getText(sKey: string, aArgs?: (string | number)[]): string {
        if (!Formatter.oI18n) {
            Formatter.oI18n = ResourceBundle.create({
                bundleName: "com.sapwebshop2026.sapwebshop.i18n.i18n",
                supportedLocales: ["de", "en"],
                fallbackLocale: "de",
                async: false
            }) as ResourceBundle;
        }
        return Formatter.oI18n.getText(sKey, aArgs);
    }

    /** Formatiert Preis + Währung. Fallback: "Preis auf Anfrage" */
    public static formatPrice(amount: number | string | null | undefined, currency: string | null | undefined): string {
        const nAmount = typeof amount === "string" ? parseFloat(amount) : amount;
        if (nAmount === null || nAmount === undefined || isNaN(nAmount) || nAmount === 0) {
            return Formatter.getText("priceOnRequest");
        }
        const sCurrency = currency ?? "EUR";
        try {
            return new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: sCurrency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(nAmount);
        } catch {
            return `${sCurrency} ${nAmount.toFixed(2)}`;
        }
    }

    /** Zeilenpreis: Einzelpreis × Menge */
    public static formatLinePrice(
        amount: number | string | null | undefined,
        currency: string | null | undefined,
        quantity: number | null | undefined
    ): string {
        const nAmount = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
        const nQty = typeof quantity === "number" ? quantity : 1;
        return Formatter.formatPrice(nAmount * nQty, currency);
    }

    /** Einzelpreis-Zeile "Menge × Einzelpreis" — nur sinnvoll bei Menge > 1, sonst leer */
    public static formatUnitLine(
        amount: number | string | null | undefined,
        currency: string | null | undefined,
        quantity: number | null | undefined
    ): string {
        const nQty = typeof quantity === "number" ? quantity : 1;
        if (nQty <= 1) {return "";}
        return `${nQty} × ${Formatter.formatPrice(amount, currency)}`;
    }

    /** Gesamtsumme — bevorzugt Backend-Total, sonst Summe der bepreisten Artikel */
    public static formatCartTotal(oCart: { items?: Array<{ price: number; currency: string; quantity: number }>; totalAmount?: number; totalCurrency?: string } | null | undefined): string {
        // 1. Versuch: Backend-Total aus ShoppingCart-Header
        if (oCart?.totalAmount && oCart.totalAmount > 0) {
            return Formatter.formatPrice(oCart.totalAmount, oCart.totalCurrency ?? "EUR");
        }
        // 2. Fallback: Summe der Frontend-bepreisten Items
        if (!oCart?.items?.length) {return Formatter.formatPrice(0, "EUR");}
        const aPriced = oCart.items.filter((i) => i.price > 0);
        if (!aPriced.length) {return Formatter.getText("priceOnRequest");}
        const sCurrency = aPriced[0]?.currency ?? "EUR";
        const nTotal = aPriced.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0);
        return Formatter.formatPrice(nTotal, sCurrency);
    }

    /** Anzahl der Artikel mit echtem Preis (> 0) */
    public static formatPricedCount(oCart: { items?: Array<{ price: number; quantity: number }> } | null | undefined): string {
        if (!oCart?.items?.length) {return "0";}
        const n = oCart.items.filter((i) => i.price > 0).reduce((s, i) => s + (i.quantity ?? 1), 0);
        return String(n);
    }

    /** Anzahl der Artikel ohne Preis ("Preis auf Anfrage") */
    public static formatUnpricedCount(oCart: { items?: Array<{ price: number; quantity: number }> } | null | undefined): string {
        if (!oCart?.items?.length) {return Formatter.getText("unpricedCount", [0]);}
        const n = oCart.items.filter((i) => !i.price || i.price === 0).reduce((s, i) => s + (i.quantity ?? 1), 0);
        return Formatter.getText("unpricedCount", [n]);
    }

    /** Prüft ob es Artikel ohne Preis gibt */
    public static hasUnpricedItems(oCart: { items?: Array<{ price: number }> } | null | undefined): boolean {
        if (!oCart?.items?.length) {return false;}
        return oCart.items.some((i) => !i.price || i.price === 0);
    }
}
