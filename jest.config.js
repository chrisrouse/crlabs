const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
    ...jestConfig,
    testMatch: [
        "**/flow-config-editor-kit/**/__tests__/**/*.test.js",
        "**/screentimer/**/__tests__/**/*.test.js",
        "**/email-recipients/**/__tests__/**/*.test.js"
    ],
    moduleNameMapper: {
        ...jestConfig.moduleNameMapper,
        // The shipped flowSupport stub's FlowAttributeChangeEvent takes no
        // constructor arguments, so a Flow output's attributeName and value
        // are unassertable against it. See the file.
        "^lightning/flowSupport$": "<rootDir>/test/jest-mocks/lightning/flowSupport"
    }
};
