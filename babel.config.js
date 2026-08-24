// Expo's default preset plus inline-import for the generated migration SQL: the `.sql` files in
// drizzle/ are inlined as strings so drizzle/migrations.js can bundle them into the app.
// See .claude/rules/database.md and openspec/changes/db-schema/design.md §8.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
