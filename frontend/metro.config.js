const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// mssql / express / etc. are Node.js-only packages.
// They cannot be bundled by Metro for web/RN → stub them out.
const STUB = path.resolve(__dirname, 'shims/empty-module.js');

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  mssql: STUB,
  express: STUB,
  'body-parser': STUB,
  cors: STUB,
  dotenv: STUB,
  tedious: STUB,
  fs: STUB,
  path: STUB,
  os: STUB,
  net: STUB,
  tls: STUB,
  crypto: STUB,
  stream: STUB,
};

// Prioritize CJS 'main' over 'module' to prevent import.meta SyntaxErrors on web
config.resolver.resolverMainFields = ['browser', 'main', 'module'];

module.exports = config;
