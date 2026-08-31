import * as SecureStore from 'expo-secure-store';

import {
  createSecureStorefrontSecretStore,
  type SecureStoreDriver,
} from './secure-storefront-session.ts';

const STOREFRONT_KEYCHAIN_SERVICE = 'storefront.sessions.v1';

export function createExpoSecureStorefrontSecretStore() {
  return createSecureStorefrontSecretStore(
    SecureStore as SecureStoreDriver,
    Object.freeze({
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      keychainService: STOREFRONT_KEYCHAIN_SERVICE,
    }),
  );
}
