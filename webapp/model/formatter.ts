/**
 * Formatter-Funktionen für den Inn2 Webshop.
 * Werden in XML-Views als .formatter.xxx referenziert.
 */
const formatter = {
    /**
     * Formatiert Preis + Währung
     * Fallback: "Preis auf Anfrage"
     */
    formatPrice(amount: number | string | null | undefined, currency: string | null | undefined): string {
        const nAmount = typeof amount === "string" ? parseFloat(amount) : amount;
        if (nAmount === null || nAmount === undefined || isNaN(nAmount) || nAmount === 0) {
            return "Preis auf Anfrage";
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
    },

    /** Zeilenpreis: Einzelpreis × Menge */
    formatLinePrice(
        amount: number | string | null | undefined,
        currency: string | null | undefined,
        quantity: number | null | undefined
    ): string {
        const nAmount = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
        const nQty = typeof quantity === "number" ? quantity : 1;
        return formatter.formatPrice(nAmount * nQty, currency);
    },

    /** Gesamtsumme — bevorzugt Backend-Total, sonst Summe der bepreisten Artikel */
    formatCartTotal(oCart: { items?: Array<{ price: number; currency: string; quantity: number }>; totalAmount?: number; totalCurrency?: string } | null | undefined): string {
        // 1. Versuch: Backend-Total aus ShoppingCart-Header
        if (oCart?.totalAmount && oCart.totalAmount > 0) {
            return formatter.formatPrice(oCart.totalAmount, oCart.totalCurrency ?? "EUR");
        }
        // 2. Fallback: Summe der Frontend-bepreisten Items
        if (!oCart?.items?.length) return formatter.formatPrice(0, "EUR");
        const aPriced = oCart.items.filter((i) => i.price > 0);
        if (!aPriced.length) return "Preis auf Anfrage";
        const sCurrency = aPriced[0]?.currency ?? "EUR";
        const nTotal = aPriced.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0);
        return formatter.formatPrice(nTotal, sCurrency);
    },

    /** Anzahl der Artikel mit echtem Preis (> 0) */
    formatPricedCount(oCart: { items?: Array<{ price: number; quantity: number }> } | null | undefined): string {
        if (!oCart?.items?.length) return "0";
        const n = oCart.items.filter((i) => i.price > 0).reduce((s, i) => s + (i.quantity ?? 1), 0);
        return String(n);
    },

    /** Anzahl der Artikel ohne Preis ("Preis auf Anfrage") */
    formatUnpricedCount(oCart: { items?: Array<{ price: number; quantity: number }> } | null | undefined): string {
        if (!oCart?.items?.length) return "0 Artikel";
        const n = oCart.items.filter((i) => !i.price || i.price === 0).reduce((s, i) => s + (i.quantity ?? 1), 0);
        return `${n} Artikel`;
    },

    /** Prüft ob es Artikel ohne Preis gibt */
    hasUnpricedItems(oCart: { items?: Array<{ price: number }> } | null | undefined): boolean {
        if (!oCart?.items?.length) return false;
        return oCart.items.some((i) => !i.price || i.price === 0);
    }
};

export default formatter;
