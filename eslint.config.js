const eslintJs = require("@eslint/js");
const salesforceLwcConfig = require("@salesforce/eslint-config-lwc/recommended");

module.exports = [
    // The kit is third-party and keeps its own style; it is linted upstream.
    { ignores: ["node_modules/**", "flow-config-editor-kit/**"] },
    eslintJs.configs.recommended,
    ...(Array.isArray(salesforceLwcConfig) ? salesforceLwcConfig : [salesforceLwcConfig]),
    {
        files: ["flowautonavigate/**/lwc/**/*.js"],
        languageOptions: { ecmaVersion: 2023, sourceType: "module" }
    },
    {
        // Jest specs are not component code: they need timers to flush
        // promises and the jest globals, neither of which the LWC rules expect.
        files: ["**/__tests__/**/*.js"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: {
                jest: "readonly",
                describe: "readonly",
                it: "readonly",
                test: "readonly",
                expect: "readonly",
                beforeEach: "readonly",
                afterEach: "readonly",
                beforeAll: "readonly",
                afterAll: "readonly",
                setTimeout: "readonly"
            }
        },
        rules: {
            "@lwc/lwc/no-async-operation": "off",
            "@lwc/lwc/no-unexpected-wire-adapter-usages": "off"
        }
    }
];
