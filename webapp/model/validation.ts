/**
 * One place for "is this input usable and what exactly gets sent", so a field only has to say
 * what it holds - not how to check it
 */

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

// Anything the model may hand over as a text value, coerced to a string
export function asText(v: unknown): string {
    if (typeof v === "string") {return v;}
    if (typeof v === "number" || typeof v === "boolean") {return String(v);}
    return "";
}

// Brings a value into the shape the backend accepts. Upper-casing comes before the cut, because
// it can grow the string: the German sharp s becomes two characters, so cutting first lets ten
// of them turn into twenty and the MERGE answers 400 (reproduced 2026-09-01).
export function normalizeText(v: unknown, oRule: FieldRule): string {
    const sValue = asText(v).trim();
    return (oRule.upperCase ? sValue.toUpperCase() : sValue).slice(0, oRule.maxLength);
}

// i18n key of the first thing wrong with an already normalized value, or undefined when it may go
// out. An empty value is only an error where the field is required.
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

// Letters, digits, spaces and hyphens, plus at least one digit - that last part keeps
// "SSSSSSSSSS" out
export function isPostalCode(sValue: string): boolean {
    return /^(?=.*\d)[A-Z0-9][A-Z0-9 -]{1,9}$/.test(sValue);
}

// A country code the runtime can name. DeliveryCountry has no value list and the backend takes
// anything that fits the field (verified 2026-09-01: "XX" and "ZZZ" answer 204), so the check has
// to come from here. Intl already carries ISO 3166-1; asking it beats a table of 250 codes that ages.
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

// A well-formed Edm.Guid. Keys read back from browser storage are user-editable, so they are
// checked before they reach a request - even one built through sap.ui.model.Filter.
export function isGuid(sValue: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sValue);
}

// A number the user typed, or null when it is none or lies outside the range. Callers decide what
// an empty field means - for a filter it is "no bound", for a quantity it is a mistake.
export function parseNumberInRange(v: unknown, nMin: number, nMax: number, bInteger = false): number | null {
    const sValue = asText(v).trim().replace(",", ".");
    // Number("") is 0, not NaN - without this an emptied quantity field would read as "zero units"
    if (!sValue) {return null;}
    const nValue = Number(sValue);
    if (!isFinite(nValue)) {return null;}
    const nResult = bInteger ? Math.round(nValue) : nValue;
    return nResult < nMin || nResult > nMax ? null : nResult;
}
