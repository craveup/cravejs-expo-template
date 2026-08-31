export interface LocalStateStore {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
}

const LOCAL_STATE_KEY_PATTERN = /^[A-Za-z0-9._-]{1,512}$/;

function assertLocalStateKey(key: string): void {
  if (!LOCAL_STATE_KEY_PATTERN.test(key)) {
    throw new TypeError('Local-state key is not storage-safe.');
  }
}

export function createInMemoryLocalStateStore(): LocalStateStore {
  const records = new Map<string, string>();

  return Object.freeze({
    async getItem(key: string): Promise<string | null> {
      assertLocalStateKey(key);
      return records.get(key) ?? null;
    },
    async removeItem(key: string): Promise<void> {
      assertLocalStateKey(key);
      records.delete(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      assertLocalStateKey(key);
      records.set(key, value);
    },
  });
}
