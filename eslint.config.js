// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions es código Deno (imports jsr:/npm:), fuera del
    // proyecto Node/Expo — ni ESLint ni tsc pueden resolverlo.
    ignores: ["dist/*", "supabase/functions/*"],
  }
]);
