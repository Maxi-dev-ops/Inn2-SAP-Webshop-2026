import fioriTools from '@sap-ux/eslint-plugin-fiori-tools';

export default [
    ...fioriTools.configs.recommended,
    {
        // no-redeclare false-positives on UI5 TS imports that shadow DOM globals (Event, History, Text, …)
        rules: {
            "no-redeclare": "off"
        }
    }
];
