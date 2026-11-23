import cdsPlugin from '@sap/eslint-plugin-cds'
import cds from '@sap/cds/eslint.config.mjs'
export default [
  cdsPlugin.configs.recommended,
  ...cds.recommended,
  { ignores: ['gen/**', '**/dist/**'] },
  // UI5 app code runs in the browser
  { files: ['app/**/webapp/**/*.js'], languageOptions: { globals: { sap: 'readonly', FileReader: 'readonly' } } }
]
