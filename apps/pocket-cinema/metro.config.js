const path = require("path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

// This app lives in a Yarn workspace; dependencies are hoisted to the repo
// root. Point Metro at the workspace root so it can resolve hoisted packages
// (e.g. @babel/runtime helpers injected by the transform).
const workspaceRoot = path.resolve(__dirname, "../..");

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, "node_modules"),
      path.resolve(workspaceRoot, "node_modules"),
    ],
    // The source uses TypeScript's NodeNext convention where relative imports
    // carry a ".js" extension that resolves to the ".ts"/".tsx" file on disk.
    // tsc and tsx honor this, but Metro does not, so rewrite the extension for
    // local imports before handing off to the default resolver.
    resolveRequest: (context, moduleName, platform) => {
      const rewritten = moduleName.replace(/^(\.\.?\/.*)\.js$/, "$1");
      return context.resolveRequest(context, rewritten, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
