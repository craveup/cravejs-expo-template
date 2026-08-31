import type { ExpoConfig } from 'expo/config';

import { brandConfig } from './src/config/brand.config.ts';
import { colors } from './src/theme/brand-theme.ts';

const assetPath = (path: string) => `./${path}`;

const config: ExpoConfig = {
  name: brandConfig.displayName,
  slug: brandConfig.slug,
  version: '1.0.0',
  orientation: 'portrait',
  icon: assetPath(brandConfig.assets.icon),
  scheme: brandConfig.scheme,
  userInterfaceStyle: 'automatic',
  ios: {
    associatedDomains: brandConfig.links.universalLinkHosts.map(
      (host) => `applinks:${host}`,
    ),
    icon: assetPath(brandConfig.assets.icon),
    bundleIdentifier: brandConfig.iosBundleIdentifier,
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    intentFilters: brandConfig.links.androidAppLinkHosts.map((host) => ({
      action: 'VIEW',
      autoVerify: true,
      category: ['BROWSABLE', 'DEFAULT'],
      data: [{ host, scheme: 'https' }],
    })),
    package: brandConfig.androidPackage,
    adaptiveIcon: {
      backgroundColor: colors.contentCanvas,
      foregroundImage: assetPath(brandConfig.assets.adaptiveIconForeground),
      backgroundImage: assetPath(brandConfig.assets.adaptiveIconBackground),
      monochromeImage: assetPath(brandConfig.assets.adaptiveIconMonochrome),
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: assetPath(brandConfig.assets.favicon),
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: colors.accent,
        image: assetPath(brandConfig.assets.splash),
        imageWidth: 76,
      },
    ],
    'expo-image',
    [
      'expo-location',
      {
        locationWhenInUsePermission: `Allow ${brandConfig.displayName} to use your location to find nearby stores and addresses.`,
      },
    ],
    'expo-secure-store',
    'expo-status-bar',
    'expo-web-browser',
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY,
        iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
  },
};

export default config;
