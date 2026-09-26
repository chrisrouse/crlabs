const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

// The kit ships its own suites; they are the only tests here.
module.exports = {
    ...jestConfig,
    testMatch: ["**/flow-config-editor-kit/**/__tests__/**/*.test.js"]
};
