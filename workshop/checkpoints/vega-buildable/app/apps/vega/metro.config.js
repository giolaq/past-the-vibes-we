const path = require("node:path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [path.resolve(__dirname, "../..")],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, "node_modules")],
    // The source uses TypeScript's NodeNext convention where relative imports
    // carry a ".js" extension that resolves to the ".ts"/".tsx" file on disk.
    // tsc and tsx honor this, but Metro does not, so rewrite the extension for
    // local imports before handing off to the default resolver.
    resolveRequest: (context, moduleName, platform) => {
      const rewritten = moduleName.replace(/^(\.\.?\/.*)\.js$/, "$1");
      return context.resolveRequest(context, rewritten, platform);
    },
  },
});
