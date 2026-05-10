/**
 * Point debug signing at ~/.android/debug.keystore instead of android/app/debug.keystore.
 * The bundled template debug.keystore shares SHA-1 with countless other apps → Firebase OAuth conflicts.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidUserDebugKeystore(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    let c = cfg.modResults.contents;
    if (c.includes("user.home") && c.includes('.android/debug.keystore')) return cfg;
    const next = c.replace(
      /storeFile file\('debug\.keystore'\)/,
      'storeFile file("${System.properties[\'user.home\']}/.android/debug.keystore")',
    );
    if (next === c) {
      return cfg;
    }
    cfg.modResults.contents = next;
    return cfg;
  });
};
