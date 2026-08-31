import {
  createStorefrontClient,
  type StorefrontSessionStore,
} from '@craveup/storefront-sdk';

import type { PublicEnvironmentConfig } from '../config/public-env.ts';
import {
  readStorefrontRuntimeProfile,
  type StorefrontRuntimeProfile,
} from '../config/storefront-runtime-profile.ts';
import {
  createCustomerAuthService,
  type CustomerAuthService,
} from '../features/auth/customer-auth-service.ts';
import {
  createCustomerAccountService,
  type CustomerAccountService,
} from '../features/account/customer-account-service.ts';
import {
  createFavouritesStore,
  type FavouritesStore,
} from '../features/favourites/favourites-store.ts';
import {
  createOnboardingStateStore,
  type OnboardingStateStore,
} from '../features/onboarding/onboarding-state-store.ts';
import {
  createOrderAccessService,
  type OrderAccessService,
} from '../features/orders/order-access-service.ts';
import {
  createLoyaltyService,
  type LoyaltyService,
} from '../features/rewards/loyalty-service.ts';
import { createAsyncLocalStateStore } from './async-local-state-store.ts';
import {
  createCartSessionStore,
  type StorefrontCartSessionStore,
} from './cart-session.ts';
import {
  createCheckoutHandoffRecoveryStore,
  type CheckoutHandoffRecoveryStore,
} from './checkout-handoff-recovery-store.ts';
import {
  createCartService,
  type CartService,
} from './cart.ts';
import {
  createCustomerSessionStore,
  type CustomerSessionStore,
} from './customer-session.ts';
import { createExpoSecureStorefrontSecretStore } from './expo-secure-storefront-session.ts';
import {
  createReceiptSessionStore,
  type ReceiptSessionStore,
} from './receipt-session.ts';
import type { StorefrontSecretStore } from './storefront-secret-store.ts';
import { createStorefrontSessionScope } from './storefront-session-scope.ts';
import type { LocalStateStore } from './local-state-store.ts';
import {
  createOrderingSessionService,
  type OrderingSessionService,
} from './ordering-session-service.ts';
import {
  createStorefrontBootstrapService,
  type StorefrontBootstrapService,
} from './storefront-bootstrap-service.ts';
import {
  createStorefrontLifecycleService,
  type StorefrontLifecycleService,
} from './storefront-lifecycle-service.ts';

export type StorefrontClient = ReturnType<typeof createStorefrontClient>;

export type StorefrontRuntime = Readonly<{
  capabilities: StorefrontRuntimeProfile['capabilities'];
  cartSessions: StorefrontCartSessionStore;
  client: StorefrontClient;
  customerSessions: CustomerSessionStore;
  environment: PublicEnvironmentConfig;
  services: Readonly<{
    bootstrap: StorefrontBootstrapService;
    cart: CartService;
    checkoutRecovery: CheckoutHandoffRecoveryStore;
    customerAccount: CustomerAccountService;
    customerAuth: CustomerAuthService;
    favourites: FavouritesStore;
    loyalty: LoyaltyService;
    lifecycle: StorefrontLifecycleService;
    onboarding: OnboardingStateStore;
    ordering: OrderingSessionService;
    orders: OrderAccessService;
  }>;
  receiptSessions: ReceiptSessionStore;
}>;

export function createStorefrontRuntime(
  profile: StorefrontRuntimeProfile,
  secrets: StorefrontSecretStore,
  localState: LocalStateStore,
): StorefrontRuntime {
  const { environment } = profile;
  const scope = createStorefrontSessionScope({
    environmentNamespace: environment.environmentNamespace,
    locationId: environment.locationId,
    merchantSlug: environment.merchantSlug,
  });
  const cartSessions = createCartSessionStore(scope, secrets);
  const customerSessions = createCustomerSessionStore(scope, secrets);
  const receiptSessions = createReceiptSessionStore(scope);
  const checkoutRecovery = createCheckoutHandoffRecoveryStore(
    scope,
    localState,
  );
  const sessionStore: StorefrontSessionStore = cartSessions;
  const client = createStorefrontClient({
    baseUrl: environment.apiOrigin,
    getAuthToken: customerSessions.getAuthToken,
    sessionStore,
  });
  const customerAuth = createCustomerAuthService(
    client.customer,
    customerSessions,
  );
  const ordering = createOrderingSessionService(
    client,
    cartSessions,
    environment.locationId,
    customerSessions,
    customerAuth.invalidateSession,
  );

  const services = Object.freeze({
    bootstrap: createStorefrontBootstrapService(
      client,
      environment.merchantSlug,
      environment.locationId,
    ),
    cart: createCartService(
      client.cart,
      cartSessions,
      ordering,
      environment.locationId,
      customerSessions,
      customerAuth.invalidateSession,
      checkoutRecovery,
    ),
    checkoutRecovery,
    customerAccount: createCustomerAccountService(
      client.customer,
      customerSessions,
      customerAuth.invalidateSession,
    ),
    customerAuth,
    favourites: createFavouritesStore(scope, localState),
    loyalty: createLoyaltyService(
      client,
      cartSessions,
      customerSessions,
      environment.locationId,
      customerAuth.invalidateSession,
    ),
    lifecycle: createStorefrontLifecycleService(
      client,
      customerAuth,
      cartSessions,
      environment.locationId,
    ),
    onboarding: createOnboardingStateStore(scope, localState),
    ordering,
    orders: createOrderAccessService(
      client,
      cartSessions,
      customerSessions,
      receiptSessions,
      environment.locationId,
      customerAuth.invalidateSession,
    ),
  });

  return Object.freeze({
    capabilities: profile.capabilities,
    cartSessions,
    client,
    customerSessions,
    environment,
    receiptSessions,
    services,
  });
}

let storefrontRuntime: StorefrontRuntime | undefined;

export function getStorefrontRuntime(): StorefrontRuntime {
  storefrontRuntime ??= createStorefrontRuntime(
    readStorefrontRuntimeProfile(),
    createExpoSecureStorefrontSecretStore(),
    createAsyncLocalStateStore(),
  );

  return storefrontRuntime;
}
