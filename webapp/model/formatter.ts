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
    }
};

export default formatter;
