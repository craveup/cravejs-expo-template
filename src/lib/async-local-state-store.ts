import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LocalStateStore } from './local-state-store.ts';

export function createAsyncLocalStateStore(): LocalStateStore {
  return Object.freeze({
    getItem(key: string): Promise<string | null> {
      return AsyncStorage.getItem(key);
    },
    async removeItem(key: string): Promise<void> {
      await AsyncStorage.removeItem(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      await AsyncStorage.setItem(key, value);
    },
  });
}
