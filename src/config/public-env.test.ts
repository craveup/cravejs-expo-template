import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  PublicEnvironmentConfigError,
  parsePublicEnvironment,
  parsePublicStorefrontScope,
  readPublicEnvironment,
  type PublicEnvironmentInput,
} from './public-env.ts';

const unsupportedCravePublicField = [
  'EXPO',
  'PUBLIC',
  'CRAVEUP',
  'API',
  'KEY',
].join('_');
const stripeSecretField = ['STRIPE', 'SECRET', 'KEY'].join('_');
const unsupportedStripePublicPrefix = ['EXPO', 'PUBLIC', 'STRIPE', ''].join('_');

const validInput = {
  EXPO_PUBLIC_CRAVEUP_API_URL: 'https://api.staging.example.com',
  EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN: 'https://checkout.staging.example.com',
  EXPO_PUBLIC_CRAVEUP_LOCATION_ID: '0123456789abcdef01234567',
  EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG: 'fixture-merchant',
  EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY: 'android-restricted-public-key',
  EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: 'ios-restricted-public-key',
} satisfies PublicEnvironmentInput;

class ReactNativeStyleUrl {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  get hash() {
    return this.value.match(/#([^/]*)/)?.[1] ?? '';
  }

  get hostname() {
    return this.value.match(/^https?:\/\/(?:[^@]+@)?([^:/?#]+)/)?.[1] ?? '';
  }

  get origin() {
    return this.value.match(/^(https?:\/\/[^/]+)/)?.[1] ?? '';
  }

  get password() {
    return this.value.match(/https?:\/\/.*:(.*)@/)?.[1] ?? '';
  }

  get pathname() {
    return this.value.match(/https?:\/\/[^/]+(\/[^?#]*)?/)?.[1] ?? '/';
  }

  get port() {
    return this.value.match(/:(\d+)(?=[/?#]|$)/)?.[1] ?? '';
  }

  get protocol() {
    const protocol = this.value.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):/)?.[1];
    return protocol ? `${protocol}:` : '';
  }

  get search() {
    const search = this.value.match(/\?([^#]*)/)?.[1];
    return search === undefined ? '' : `?${search}`;
  }

  get username() {
    return this.value.match(/^https?:\/\/([^:@]+)(?::[^@]*)?@/)?.[1] ?? '';
  }
}

function withReactNativeUrl<T>(operation: () => T): T {
  const originalUrl = globalThis.URL;

  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    value: ReactNativeStyleUrl,
    writable: true,
  });

  try {
    return operation();
  } finally {
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      value: originalUrl,
      writable: true,
    });
  }
}

function expectConfigError(
  input: PublicEnvironmentInput,
  field: keyof PublicEnvironmentInput,
) {
  assert.throws(
    () => parsePublicEnvironment(input),
    (error: unknown) =>
      error instanceof PublicEnvironmentConfigError && error.field === field,
  );
}

test('parses and canonicalizes the complete approved public environment', () => {
  assert.deepEqual(
    parsePublicEnvironment({
      ...validInput,
      EXPO_PUBLIC_CRAVEUP_API_URL: '  https://API.STAGING.EXAMPLE.COM:443/  ',
      EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG: '  fixture-merchant  ',
    }),
    {
      apiOrigin: 'https://api.staging.example.com',
      checkoutOrigin: 'https://checkout.staging.example.com',
      environmentNamespace: 'env-edba1d5cf699b81a',
      locationId: '0123456789abcdef01234567',
      maps: {
        androidApiKey: 'android-restricted-public-key',
        iosApiKey: 'ios-restricted-public-key',
      },
      merchantSlug: 'fixture-merchant',
    },
  );
});

test('parses the anonymous Storefront scope without unrelated checkout or map inputs', () => {
  assert.deepEqual(
    parsePublicStorefrontScope({
      EXPO_PUBLIC_CRAVEUP_API_URL: '  https://API.STAGING.EXAMPLE.COM:443/  ',
      EXPO_PUBLIC_CRAVEUP_LOCATION_ID: '0123456789abcdef01234567',
      EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG: '  fixture-merchant  ',
    }),
    {
      apiOrigin: 'https://api.staging.example.com',
      environmentNamespace: 'env-edba1d5cf699b81a',
      locationId: '0123456789abcdef01234567',
      merchantSlug: 'fixture-merchant',
    },
  );
});

test('canonical API origins are stable under React Native URL semantics', () => {
  const config = withReactNativeUrl(() =>
    parsePublicEnvironment({
      ...validInput,
      EXPO_PUBLIC_CRAVEUP_API_URL: 'https://API.STAGING.EXAMPLE.COM:443/',
    }),
  );

  assert.equal(config.apiOrigin, 'https://api.staging.example.com');
  assert.equal(config.environmentNamespace, 'env-edba1d5cf699b81a');
});

test('rejects malformed hosts under React Native URL semantics', () => {
  withReactNativeUrl(() => {
    for (const apiUrl of [
      'https://not valid/',
      'https://api.example.com:99999/',
    ]) {
      expectConfigError(
        { ...validInput, EXPO_PUBLIC_CRAVEUP_API_URL: apiUrl },
        'EXPO_PUBLIC_CRAVEUP_API_URL',
      );
    }
  });
});

test('accepts omitted optional native map keys without inventing a fallback', () => {
  const config = parsePublicEnvironment({
    ...validInput,
    EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY: ' ',
    EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: undefined,
  });

  assert.deepEqual(config.maps, {});
});

test('reads the approved Expo environment without importing unrelated variables', () => {
  const previousValues = new Map<string, string | undefined>();

  for (const [field, value] of Object.entries(validInput)) {
    previousValues.set(field, process.env[field]);
    process.env[field] = value;
  }
  previousValues.set(
    unsupportedCravePublicField,
    process.env[unsupportedCravePublicField],
  );
  process.env[unsupportedCravePublicField] = 'must-not-be-consumed';

  try {
    assert.deepEqual(readPublicEnvironment(), parsePublicEnvironment(validInput));
  } finally {
    for (const [field, value] of previousValues) {
      if (value === undefined) delete process.env[field];
      else process.env[field] = value;
    }
  }
});

test('isolates reused tenant identifiers by canonical API origin', () => {
  const staging = parsePublicEnvironment(validInput);
  const production = parsePublicEnvironment({
    ...validInput,
    EXPO_PUBLIC_CRAVEUP_API_URL: 'https://api.example.com',
  });

  assert.notEqual(staging.environmentNamespace, production.environmentNamespace);
  assert.match(staging.environmentNamespace, /^env-[a-f0-9]{16}$/);
  assert.doesNotMatch(staging.environmentNamespace, /[:/]/);
});

test('rejects missing required public configuration', () => {
  for (const field of [
    'EXPO_PUBLIC_CRAVEUP_API_URL',
    'EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN',
    'EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG',
    'EXPO_PUBLIC_CRAVEUP_LOCATION_ID',
  ] as const) {
    expectConfigError({ ...validInput, [field]: undefined }, field);
  }
});

test('rejects malformed API origins, merchant slugs, and location IDs', () => {
  for (const apiUrl of [
    'http://api.example.com',
    'https://user:password@api.example.com',
    'https://api.example.com/api/v1',
    'https://api.example.com?tenant=fixture-merchant',
  ]) {
    expectConfigError(
      { ...validInput, EXPO_PUBLIC_CRAVEUP_API_URL: apiUrl },
      'EXPO_PUBLIC_CRAVEUP_API_URL',
    );
  }

  expectConfigError(
    { ...validInput, EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG: 'Fixture Merchant' },
    'EXPO_PUBLIC_CRAVEUP_MERCHANT_SLUG',
  );
  expectConfigError(
    { ...validInput, EXPO_PUBLIC_CRAVEUP_LOCATION_ID: 'santa-monica' },
    'EXPO_PUBLIC_CRAVEUP_LOCATION_ID',
  );
});

test('requires the exact canonical HTTPS hosted-checkout origin', () => {
  for (const checkoutOrigin of [
    'http://checkout.staging.example.com',
    'https://user:password@checkout.staging.example.com',
    'https://checkout.staging.example.com/',
    'https://checkout.staging.example.com/pay',
    'https://checkout.staging.example.com?merchant=fixture',
    'https://checkout.staging.example.com#handoff',
    ' https://checkout.staging.example.com',
    'https://checkout.staging.example.com ',
    'https://CHECKOUT.STAGING.EXAMPLE.COM',
    'https://checkout.staging.example.com:443',
  ]) {
    expectConfigError(
      { ...validInput, EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN: checkoutOrigin },
      'EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN',
    );
  }

  assert.equal(
    parsePublicEnvironment({
      ...validInput,
      EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN:
        'https://checkout.staging.example.com:8443',
    }).checkoutOrigin,
    'https://checkout.staging.example.com:8443',
  );
});

test('does not infer the hosted-checkout origin from another public value', () => {
  expectConfigError(
    { ...validInput, EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN: undefined },
    'EXPO_PUBLIC_CRAVEUP_CHECKOUT_ORIGIN',
  );
});

test('requires different restricted map keys when both platforms are configured', () => {
  expectConfigError(
    {
      ...validInput,
      EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY: 'same-public-map-key',
      EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: 'same-public-map-key',
    },
    'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY',
  );
});

test('configuration errors never include the rejected value', () => {
  const rejectedValue = 'https://user:super-secret@example.com';

  assert.throws(
    () =>
      parsePublicEnvironment({
        ...validInput,
        EXPO_PUBLIC_CRAVEUP_API_URL: rejectedValue,
      }),
    (error: unknown) =>
      error instanceof PublicEnvironmentConfigError &&
      !error.message.includes(rejectedValue) &&
      !error.message.includes('super-secret'),
  );
});

test('runtime reads use Expo-supported static dot notation and no private inputs', () => {
  const source = readFileSync(new URL('./public-env.ts', import.meta.url), 'utf8');

  for (const field of Object.keys(validInput)) {
    assert.match(source, new RegExp(`process\\.env\\.${field}\\b`));
  }
  assert.doesNotMatch(source, /process\.env\[/);
  assert.equal(source.includes(unsupportedCravePublicField), false);
  assert.equal(source.includes(stripeSecretField), false);
  assert.equal(source.includes(unsupportedStripePublicPrefix), false);
  assert.doesNotMatch(source, /@stripe\/stripe-react-native/);
  assert.doesNotMatch(source, /\bfetch\b|SecureStore|@craveup\/storefront-sdk/);
});
