/*global QUnit*/
import opaTest from "sap/ui/test/opaQunit";
import AppPage from "./pages/AppPage";

import Opa5 from "sap/ui/test/Opa5";

QUnit.module("Navigation Journey");

const onTheAppPage = new AppPage();
Opa5.extendConfig({
	viewNamespace: "com.sapwebshop2026.sapwebshop.view.",
	autoWait: true
});

opaTest("Should see the initial page of the app", function () {
	// Arrangements
	 
	onTheAppPage.iStartMyUIComponent({
		componentConfig: {
			name: "com.sapwebshop2026.sapwebshop"
		}
	});

	// Assertions
	onTheAppPage.iShouldSeeTheApp();


	// Cleanup
	 
	onTheAppPage.iTeardownMyApp();
});
