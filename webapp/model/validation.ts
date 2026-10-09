// Input rules: a field only says what it holds, the checks and the shape sent live here

// -- Field rules -- //

// What a text field accepts and how its value is brought into the backend's shape
export interface FieldRule {
    // MaxLength of the backend field the value is written to
    maxLength: number;
    // Backend stores this field upper-cased (sap:display-format="UpperCase")
    upperCase?: boolean;
    // Applies to a non-empty value only; an empty one is governed by bRequired
    check?: (sValue: string) => boolean;
    messageKey?: string;
}

// Module state as statics, matching the Constants/Service style of this project
class Shared {
    public static readonly MSG_REQUIRED = "checkoutFieldRequired";
    // Built on first use: constructing the region list per keystroke is wasted work
    public static regionNames: Intl.DisplayNames | null | undefined;
}

// -- Normalize & check -- //

// Anything the model may hand over as a text value, coerced to a string
export function asText(v: unknown): string {
    if (typeof v === "string") {return v;}
    if (typeof v === "number" || typeof v === "boolean") {return String(v);}
    return "";
}

// Brings a value into the backend's shape; upper-case before cutting, as it can make the string longer
export function normalizeText(v: unknown, oRule: FieldRule): string {
    const sValue = asText(v).trim();
    return (oRule.upperCase ? sValue.toUpperCase() : sValue).slice(0, oRule.maxLength);
}

// i18n key of the first problem of a normalized value, or undefined; empty only fails when required
export function checkText(sValue: string, oRule: FieldRule, bRequired: boolean): string | undefined {
    if (!sValue) {return bRequired ? Shared.MSG_REQUIRED : undefined;}
    if (oRule.check && !oRule.check(sValue)) {return oRule.messageKey ?? Shared.MSG_REQUIRED;}
    return undefined;
}

// -- Reusable checks -- //

// At least one letter: keeps "," or "#" out of a street or a town name
export function hasLetter(sValue: string): boolean {
    return /\p{L}/u.test(sValue);
}

// At least one letter or digit: a reference of pure punctuation says nothing to the approver
export function hasAlphanumeric(sValue: string): boolean {
    return /[\p{L}\p{N}]/u.test(sValue);
}

// Letters, digits, spaces and hyphens, with at least one digit
export function isPostalCode(sValue: string): boolean {
    return /^(?=.*\d)[A-Z0-9][A-Z0-9 -]{1,9}$/.test(sValue);
}

// A two-letter country code Intl can name; the backend itself accepts anything that fits
export function isKnownCountry(sValue: string): boolean {
    // ZZ is the placeholder CLDR answers with for "unknown region" - it has a name but no country
    if (!/^[A-Z]{2}$/.test(sValue) || sValue === "ZZ") {return false;}
    if (Shared.regionNames === undefined) {
        try {
            Shared.regionNames = new Intl.DisplayNames(["en"], { type: "region" });
        } catch {
            Shared.regionNames = null;
        }
    }
    // Without the ISO data the shape check above is all there is; better than refusing every code
    if (!Shared.regionNames) {return true;}
    try {
        return Shared.regionNames.of(sValue) !== sValue;
    } catch {
        return false;
    }
}

// -- Other input -- //

// A well-formed Edm.Guid; keys from browser storage are user-editable, so they are checked first
export function isGuid(sValue: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sValue);
}

// A typed number within the range, or null; callers decide what an empty field means
export function parseNumberInRange(v: unknown, nMin: number, nMax: number, bInteger = false): number | null {
    const sValue = asText(v).trim().replace(",", ".");
    // Number("") is 0, not NaN - without this an emptied quantity field would read as "zero units"
    if (!sValue) {return null;}
    const nValue = Number(sValue);
    if (!isFinite(nValue)) {return null;}
    const nResult = bInteger ? Math.round(nValue) : nValue;
    return nResult < nMin || nResult > nMax ? null : nResult;
}
