/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["sapwebshop/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
