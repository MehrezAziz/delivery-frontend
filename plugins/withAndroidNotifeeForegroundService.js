/**
 * Notifee on Expo / RN new architecture:
 * 1) Local Maven — `app.notifee:core` ships under node_modules; the library's own
 *    rootProject.allprojects hook often runs too late, so Gradle resolves `:+` against
 *    Maven Central and fails. Inject the repo in the root project build.gradle.
 * 2) Manifest — foreground service permissions + service (see project-status.md).
 */
const {
  withAndroidManifest,
  withProjectBuildGradle,
  AndroidConfig,
} = require('@expo/config-plugins');

const NOTIFEE_FG_SERVICE = 'app.notifee.core.ForegroundService';
function withNotifeeLocalMavenRepository(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      return cfg;
    }
    let contents = cfg.modResults.contents;

    // Must inject into `allprojects { repositories { ... } }`, not `buildscript { repositories }`:
    // the first mavenCentral() in the file is usually buildscript-only and does not resolve :app deps.
    const allprojectsRepos = /allprojects\s*\{\s*repositories\s*\{/m;
    if (!allprojectsRepos.test(contents)) {
      throw new Error(
        '[withAndroidNotifeeForegroundService] android/build.gradle has no allprojects.repositories — cannot inject Notifee maven repo.',
      );
    }
    if (/\ballprojects\s*\{[\s\S]*?repositories\s*\{[\s\S]*?@notifee\/react-native\/android\/libs/s.test(contents)) {
      return cfg;
    }

    const mavenLine = '    maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }';
    const injected = contents.replace(
      /(allprojects\s*\{\s*repositories\s*\{\s*google\(\)\s*\n\s*mavenCentral\(\)\s*\n)/m,
      `$1${mavenLine}\n`,
    );
    if (injected === contents) {
      throw new Error(
        '[withAndroidNotifeeForegroundService] Could not match allprojects repositories block to inject Notifee maven (Expo template changed?).',
      );
    }
    cfg.modResults.contents = injected;
    return cfg;
  });
}

function withAndroidNotifeeForegroundService(config) {
  config = withNotifeeLocalMavenRepository(config);
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;

    AndroidConfig.Permissions.ensurePermission(
      manifest,
      'android.permission.FOREGROUND_SERVICE',
    );
    AndroidConfig.Permissions.ensurePermission(
      manifest,
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    );

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const existing = app.service;
    const list = Array.isArray(existing) ? existing : existing ? [existing] : [];

    const already = list.some((s) => s.$['android:name'] === NOTIFEE_FG_SERVICE);
    if (!already) {
      list.push({
        $: {
          'android:name': NOTIFEE_FG_SERVICE,
          'android:foregroundServiceType': 'dataSync',
        },
      });
    }
    app.service = list;

    return cfg;
  });
}

module.exports = withAndroidNotifeeForegroundService;
