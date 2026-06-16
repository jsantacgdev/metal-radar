import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const isDevBuild =
    process.env.EAS_BUILD_PROFILE === 'development' || process.env.NODE_ENV === 'development';

  return {
    ...config,
    name: 'Metal Radar',
    slug: 'metal-radar',
    scheme: 'metalradar',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#0a0a0c',
    },
    plugins: [
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Metal Radar usa tu ubicación para mostrar conciertos cercanos.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#cf2e24',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Permite a Metal Radar acceder a tus fotos para añadirlas al diario.',
          cameraPermission:
            'Permite a Metal Radar usar la cámara para capturar momentos del concierto.',
        },
      ],
      'expo-font',
      [
        '@sentry/react-native/expo',
        {
          url: 'https://sentry.io/',
          project: 'react-native',
          organization: 'metal-radar-i0',
        },
      ],
      [
        'expo-calendar',
        {
          calendarPermission: 'Permite a Metal Radar añadir conciertos a tu calendario.',
        },
      ],
      // expo-dev-client SOLO en builds de desarrollo
      // ...(isDevBuild ? ['expo-dev-client'] : []),
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.metalradar.app',
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Metal Radar usa tu ubicación para mostrar conciertos cercanos.',
      },
    },
    android: {
      package: 'com.metalradar.app',
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0a0a0c',
      },
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
      blockedPermissions: ['android.permission.RECORD_AUDIO'],
    },
    extra: {
      eas: {
        projectId: '167febb3-79e2-40ea-8cee-4637f6963863',
      },
    },
  };
};
