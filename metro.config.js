// Expo's default Metro config plus `sql` as a source extension, so the generated migration files
// in drizzle/ resolve; babel.config.js inlines them. See design.md §8.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');

module.exports = config;
