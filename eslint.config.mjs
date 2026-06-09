import fioriTools from '@sap-ux/eslint-plugin-fiori-tools';

export default [
    ...fioriTools.configs.recommended,
    {
        rules: {
            // Die Basis-Regel meldet false-positives, wenn TS-Imports gleichnamige
            // DOM-Globals überschatten (z. B. import Event from "sap/ui/base/Event",
            // import Text from "sap/m/Text"). Für TypeScript ist das harmlos; echte
            // Redeklarationen fängt der Compiler bzw. @typescript-eslint/no-redeclare ab.
            // (Offizielle typescript-eslint-Empfehlung: Basis-Regel deaktivieren.)
            "no-redeclare": "off"
        }
    }
];
