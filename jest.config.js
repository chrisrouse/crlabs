const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
    ...jestConfig,
    testMatch: [
        "**/foundations/**/__tests__/**/*.test.js",
        "**/screen-flow/screen-timer/**/__tests__/**/*.test.js",
        "**/screen-flow/email-recipients/**/__tests__/**/*.test.js",
        "**/experience-cloud/**/__tests__/**/*.test.js"
    ],
    moduleNameMapper: {
        ...jestConfig.moduleNameMapper,
        // The shipped flowSupport stub's FlowAttributeChangeEvent takes no
        // constructor arguments, so a Flow output's attributeName and value
        // are unassertable against it. See the file.
        "^lightning/flowSupport$": "<rootDir>/test/jest-mocks/lightning/flowSupport",
        // CSS-only modules have no .js file, which the LWC resolver needs, so point each one at
        // its stylesheet.
        "^c/crEditorStyles$":
            "<rootDir>/foundations/force-app/components/lwc/crEditorStyles/crEditorStyles.css"
    }
};
