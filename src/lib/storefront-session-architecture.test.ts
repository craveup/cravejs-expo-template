import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const contractFiles = [
  'src/lib/cart-session.ts',
  'src/lib/customer-request-failure.ts',
  'src/lib/customer-session.ts',
  'src/lib/local-state-store.ts',
  'src/lib/receipt-session.ts',
  'src/lib/secure-storefront-session.ts',
  'src/lib/storefront-errors.ts',
  'src/lib/storefront-pagination.ts',
  'src/lib/storefront-secret-store.ts',
  'src/lib/storefront-session-scope.ts',
] as const;

function source(path: (typeof contractFiles)[number]): string {
  return readFileSync(resolve(root, path), 'utf8');
}

function sourceFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

test('pure session contracts have no transport, environment, logging, or native storage', () => {
  for (const path of contractFiles) {
    assert.doesNotMatch(
      source(path),
      /@craveup\/storefront-sdk|expo-secure-store|AsyncStorage|process\.env|\bfetch\s*\(|console\./,
      path,
    );
  }
});

test('native secret adapter uses only asynchronous SecureStore operations', () => {
  const binding = sourceFile('src/lib/expo-secure-storefront-session.ts');
  const adapter = sourceFile('src/lib/secure-storefront-session.ts');
  const appConfig = sourceFile('app.config.ts');

  assert.match(binding, /from 'expo-secure-store'/);
  assert.match(binding, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  assert.match(adapter, /getItemAsync/);
  assert.match(adapter, /setItemAsync/);
  assert.match(adapter, /deleteItemAsync/);
  assert.doesNotMatch(`${binding}\n${adapter}`, /\bfetch\s*\(|console\.|process\.env/);
  assert.match(appConfig, /['"]expo-secure-store['"]/);
});

test('receipt capability is held only by the in-memory receipt adapter', () => {
  const receipt = source('src/lib/receipt-session.ts');

  assert.match(receipt, /new Map<string, string>\(\)/);
  assert.doesNotMatch(receipt, /StorefrontSecretStore|setItem|getItem|deleteItem/);
});

test('customer, cart, and receipt secrets never appear in thrown messages', () => {
  const scope = source('src/lib/storefront-session-scope.ts');

  assert.doesNotMatch(scope, /`[^`]*\$\{value\}/);
  assert.match(scope, /Invalid Storefront session \$\{field\}: \$\{reason\}/);
});

test('the shared runtime publishes one composed headless service boundary', () => {
  const runtime = sourceFile('src/lib/storefront.ts');

  assert.equal(runtime.match(/\bcreateStorefrontClient\s*\(/g)?.length, 1);
  assert.match(runtime, /readStorefrontRuntimeProfile\s*\(\s*\)/);
  assert.doesNotMatch(runtime, /readPublicEnvironment\s*\(\s*\)/);
  assert.match(runtime, /capabilities:\s*profile\.capabilities/);
  for (const factory of [
    'createCartService',
    'createCustomerAccountService',
    'createCustomerAuthService',
    'createFavouritesStore',
    'createLoyaltyService',
    'createOnboardingStateStore',
    'createOrderAccessService',
    'createOrderingSessionService',
    'createStorefrontBootstrapService',
    'createStorefrontLifecycleService',
  ]) {
    assert.match(runtime, new RegExp(`\\b${factory}\\s*\\(`), factory);
  }
  assert.equal(runtime.match(/customerAuth\.invalidateSession/g)?.length, 5);
  assert.doesNotMatch(runtime, /\bfetch\s*\(|console\.|apiKey|secretKey/i);
});

test('customer services reuse one auth-failure and pagination path', () => {
  for (const path of [
    'src/features/account/customer-account-service.ts',
    'src/features/orders/order-access-service.ts',
    'src/features/rewards/loyalty-service.ts',
    'src/lib/ordering-session-service.ts',
  ]) {
    const service = sourceFile(path);

    assert.match(service, /mapCustomerRequestFailure/, path);
    assert.doesNotMatch(service, /function\s+(customerFailure|isSafeCursor)\b/, path);
  }
});
