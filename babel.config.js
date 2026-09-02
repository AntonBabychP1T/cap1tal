// Expo's default preset plus inline-import for the generated migration SQL: the `.sql` files in
// drizzle/ are inlined as strings so drizzle/migrations.js can bundle them into the app.
// See .claude/rules/database.md and openspec/changes/db-schema/design.md §8.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // `disableDeepImportWarnings`: src/app/_layout.tsx's rejection tracker reaches React
      // Native's options object via a deep `require('react-native/Libraries/…')` — the one
      // way to reach it (see that file's comment) — which this preset otherwise answers with
      // a `console.warn` appended to the module, a LogBox banner on every dev launch.
      // See openspec/changes/bug-report/design.md D4b.
      ['babel-preset-expo', { disableDeepImportWarnings: true }],
    ],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
