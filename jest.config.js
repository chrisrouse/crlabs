const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
    ...jestConfig,
    testMatch: [
        "**/flow-config-editor-kit/**/__tests__/**/*.test.js",
        "**/flowautonavigate/**/__tests__/**/*.test.js",
        "**/flowgrid/**/__tests__/**/*.test.js"
    ],
    moduleNameMapper: {
        ...jestConfig.moduleNameMapper,
        // The shipped flowSupport stub's FlowAttributeChangeEvent takes no
        // constructor arguments, so a Flow output's attributeName and value
        // are unassertable against it. See the file.
        "^lightning/flowSupport$": "<rootDir>/flowautonavigate/test/jest-mocks/lightning/flowSupport",
        // sfdx-lwc-jest stubs modalBody/modalFooter/modalHeader but not
        // `modal`, so LightningModal has no stub. See the file for details.
        "^lightning/modal$": "<rootDir>/flowgrid/test/jest-mocks/lightning/modal"
    }
};
