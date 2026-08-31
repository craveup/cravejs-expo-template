import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import {
  mapHostedBrowserResult,
  type HostedCheckoutBrowser,
} from './hosted-checkout.ts';

export function createExpoHostedCheckoutBrowser(): HostedCheckoutBrowser {
  return Object.freeze({
    async open(url: string) {
      if (Platform.OS === 'web') {
        await Linking.openURL(url);
        return 'opened';
      }

      const result = await WebBrowser.openBrowserAsync(url);
      return mapHostedBrowserResult(result.type);
    },
  });
}
