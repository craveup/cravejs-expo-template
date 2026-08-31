import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CustomerAddress } from '@craveup/storefront-sdk';

import { createCustomerSessionStore } from '../../lib/customer-session.ts';
import { createInMemoryStorefrontSecretStore } from '../../lib/storefront-secret-store.ts';
import { createStorefrontSessionScope } from '../../lib/storefront-session-scope.ts';
import {
  createCustomerAccountService,
  type CustomerAccountClient,
} from './customer-account-service.ts';

const scope = createStorefrontSessionScope({
  environmentNamespace: 'env-0123456789abcdef',
  locationId: '0123456789abcdef01234567',
  merchantSlug: 'example-merchant',
});

const address: CustomerAddress = {
  addressId: 'address_fixture',
  createdAt: '2099-01-01T00:00:00.000Z',
  fullAddress: '100 Example Avenue, Sample City',
  lat: 34.017,
  line1: '100 Example Avenue',
  line2: '',
  line3: '',
  lng: -118.499,
  revision: 1,
};

function client(overrides: Partial<{
  create: CustomerAccountClient['addresses']['create'];
  deleteAddress: CustomerAccountClient['addresses']['delete'];
  deletePayment: CustomerAccountClient['savedPayments']['delete'];
  listAddresses: CustomerAccountClient['addresses']['list'];
  listPayments: CustomerAccountClient['savedPayments']['list'];
  update: CustomerAccountClient['addresses']['update'];
}> = {}): CustomerAccountClient {
  return {
    addresses: {
      create: overrides.create ?? (async () => address),
      delete:
        overrides.deleteAddress ??
        (async (addressId) => ({ addressId, success: true })),
      list:
        overrides.listAddresses ??
        (async () => ({ items: [address], nextCursor: null })),
      update: overrides.update ?? (async () => ({ ...address, revision: 2 })),
    },
    savedPayments: {
      delete: overrides.deletePayment ?? (async () => ({ success: true })),
      list:
        overrides.listPayments ??
        (async () => [
          {
            brand: 'visa',
            displayBrand: 'Visa',
            expMonth: 12,
            expYear: 2099,
            id: 'payment_fixture',
            last4: '4242',
          },
        ]),
    },
  };
}

function setup(clientValue: CustomerAccountClient) {
  const sessions = createCustomerSessionStore(
    scope,
    createInMemoryStorefrontSecretStore(),
  );
  return {
    service: createCustomerAccountService(clientValue, sessions),
    sessions,
  };
}

test('address creation forwards validated public fields with one stable key', async () => {
  const calls: unknown[] = [];
  const { service } = setup(
    client({
      async create(input, config) {
        calls.push({ config, input });
        return address;
      },
    }),
  );
  const input = {
    fullAddress: address.fullAddress,
    lat: address.lat,
    line1: address.line1,
    lng: address.lng,
  };

  const result = await service.createAddress(input, 'intent_address_0001');

  assert.equal(result.kind, 'ready');
  assert.deepEqual(calls, [
    { config: { idempotencyKey: 'intent_address_0001' }, input },
  ]);
});

test('address update sends both stable key and explicit revision', async () => {
  const calls: unknown[] = [];
  const { service } = setup(
    client({
      async update(addressId, input, config) {
        calls.push({ addressId, config, input });
        return { ...address, line1: input.line1 ?? address.line1, revision: 2 };
      },
    }),
  );

  const result = await service.updateAddress(
    address.addressId,
    { line1: '101 Example Avenue' },
    1,
    'intent_address_0002',
  );

  assert.equal(result.kind, 'ready');
  assert.deepEqual(calls, [
    {
      addressId: 'address_fixture',
      config: { idempotencyKey: 'intent_address_0002', revision: 1 },
      input: { line1: '101 Example Avenue' },
    },
  ]);
});

test('address pagination and saved payments expose only typed public DTOs', async () => {
  const { service } = setup(
    client({
      async listAddresses() {
        return {
          items: [
            { ...address, providerAddressId: 'provider-address-secret' },
          ],
          nextCursor: null,
        };
      },
      async listPayments() {
        return [
          {
            brand: 'visa',
            displayBrand: 'Visa',
            expMonth: 12,
            expYear: 2099,
            id: 'payment_fixture',
            last4: '4242',
            providerPaymentMethodId: 'provider-payment-secret',
          },
        ];
      },
    }),
  );

  const addresses = await service.listAddresses({ limit: 20 });
  const payments = await service.listSavedPayments();

  assert.equal(addresses.kind, 'ready');
  assert.equal(payments.kind, 'ready');
  assert.deepEqual(
    payments.kind === 'ready' ? payments.data[0] : undefined,
    {
      brand: 'visa',
      displayBrand: 'Visa',
      expMonth: 12,
      expYear: 2099,
      id: 'payment_fixture',
      last4: '4242',
    },
  );
  assert.doesNotMatch(
    JSON.stringify({ addresses, payments }),
    /provider-address|provider-payment|providerAddressId|providerPaymentMethodId/i,
  );
});

test('malformed saved-payment display fields fail closed', async () => {
  const { service } = setup(
    client({
      async listPayments() {
        return [
          {
            brand: 'visa',
            displayBrand: 'Visa',
            expMonth: 13,
            expYear: 2099,
            id: 'payment_fixture',
            last4: '42',
          },
        ];
      },
    }),
  );

  assert.equal((await service.listSavedPayments()).kind, 'failed');
});

test('invalid coordinates, empty updates, IDs, revisions, and cursors make no request', async () => {
  let calls = 0;
  const { service } = setup(
    client({
      async create() {
        calls += 1;
        return address;
      },
      async listAddresses() {
        calls += 1;
        return { items: [], nextCursor: null };
      },
      async update() {
        calls += 1;
        return address;
      },
    }),
  );

  assert.equal(
    (
      await service.createAddress(
        { fullAddress: 'Address', lat: 100, line1: 'Address', lng: 0 },
        'intent_address_0003',
      )
    ).kind,
    'failed',
  );
  assert.equal((await service.listAddresses({ cursor: ' bad ' })).kind, 'failed');
  assert.equal(
    (
      await service.updateAddress(
        '../address',
        {} as never,
        -1,
        'short',
      )
    ).kind,
    'failed',
  );
  assert.equal(calls, 0);
});

test('delete actions validate resource identity and never invent success', async () => {
  const { service } = setup(
    client({
      async deleteAddress() {
        return { addressId: 'different_address', success: true };
      },
      async deletePayment() {
        return { success: true };
      },
    }),
  );

  assert.equal(
    (await service.deleteAddress('address_fixture', 'intent_delete_0001')).kind,
    'failed',
  );
  assert.equal((await service.deleteSavedPayment('payment_fixture')).kind, 'ready');
  assert.equal((await service.deleteSavedPayment('../payment')).kind, 'failed');
});

test('expired customer authorization clears the scoped JWT', async () => {
  const { service, sessions } = setup(
    client({
      async listPayments() {
        throw { code: 'UNAUTHORIZED', status: 401 };
      },
    }),
  );
  await sessions.setToken('customer.jwt.fixture');

  const result = await service.listSavedPayments();

  assert.equal(result.kind, 'failed');
  assert.equal(await sessions.getAuthToken(), null);
});

test('account service has no direct transport, serviceability guess, or secret handling', () => {
  const source = readFileSync(
    new URL('./customer-account-service.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    source,
    /\bfetch\s*\(|console\.|process\.env|expo-secure-store|serviceable|deliverable|customerJwt|clientSecret/i,
  );
  assert.match(source, /import type \{[\s\S]*StorefrontClient/);
});
