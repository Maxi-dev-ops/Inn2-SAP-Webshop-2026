/*
 * QUnit-Testsuite-Bootstrap (Fiori-Generator). Registriert die Unit- und die
 * OPA-Testseite beim übergeordneten Test-Runner-Frame (parent.jsUnitTestSuite).
 */
interface JsUnitTestSuite {
    addTestPage(sPath: string): void;
}

(window as Window & { suite?: () => JsUnitTestSuite }).suite = function (): JsUnitTestSuite {
    const TestSuite = (parent as unknown as { jsUnitTestSuite: new () => JsUnitTestSuite }).jsUnitTestSuite;
    const oSuite = new TestSuite();
    const sContextPath = location.pathname.substring(0, location.pathname.lastIndexOf("/") + 1);

    oSuite.addTestPage(sContextPath + "unit/unitTests.qunit.html");
    oSuite.addTestPage(sContextPath + "integration/opaTests.qunit.html");

    return oSuite;
};
