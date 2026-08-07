const { withAppBuildGradle } = require('@expo/config-plugins');

const INSERTION = `
android.applicationVariants.all { variant ->
    variant.outputs.all { output ->
        outputFileName = "metal-radar-\${variant.versionName}-\${variant.buildType.name}.apk"
    }
}
`;

module.exports = function withApkName(config) {
  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('outputFileName')) {
      config.modResults.contents += INSERTION;
    }
    return config;
  });
};
