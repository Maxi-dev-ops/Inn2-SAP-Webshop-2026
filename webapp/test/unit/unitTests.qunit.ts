/* global QUnit */
// https://api.qunitjs.com/config/autostart/
QUnit.config.autostart = false;

// import all your QUnit tests here
void Promise.all([
	// Add unit test modules here as the app grows
]).then(() => {
	QUnit.start();
});
