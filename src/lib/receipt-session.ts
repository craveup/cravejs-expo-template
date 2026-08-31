import {
  assertSafeStorefrontResourceId,
  assertStorefrontSecret,
  createStorefrontSessionScope,
  type StorefrontSessionScope,
} from './storefront-session-scope.ts';

export type ReceiptRequestConfig = Readonly<{
  receiptToken: string;
}>;

export interface ReceiptSessionStore {
  capture(receiptId: string, receiptToken: string): void;
  clear(receiptId: string): void;
  clearAll(): void;
  getRequestConfig(receiptId: string): ReceiptRequestConfig | undefined;
}

export function createReceiptSessionStore(
  inputScope: StorefrontSessionScope,
): ReceiptSessionStore {
  createStorefrontSessionScope(inputScope);
  const capabilities = new Map<string, string>();

  return Object.freeze({
    capture(receiptId: string, receiptToken: string): void {
      const id = assertSafeStorefrontResourceId(receiptId, 'receiptId');
      const token = assertStorefrontSecret(
        receiptToken,
        'receiptToken',
        2_048,
      );
      capabilities.set(id, token);
    },
    clear(receiptId: string): void {
      const id = assertSafeStorefrontResourceId(receiptId, 'receiptId');
      capabilities.delete(id);
    },
    clearAll(): void {
      capabilities.clear();
    },
    getRequestConfig(receiptId: string): ReceiptRequestConfig | undefined {
      const id = assertSafeStorefrontResourceId(receiptId, 'receiptId');
      const receiptToken = capabilities.get(id);

      return receiptToken ? Object.freeze({ receiptToken }) : undefined;
    },
  });
}
