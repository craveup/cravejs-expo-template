import type { StorefrontCart } from '@craveup/storefront-sdk';

import type { StorefrontCartSessionStore } from '../../lib/cart-session.ts';
import type { CartService, CartServiceResult } from '../../lib/cart.ts';
import type { StorefrontBootstrapService } from '../../lib/storefront-bootstrap-service.ts';
import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import type { LoyaltyService } from '../rewards/loyalty-service.ts';
import { createTranslator } from '../../i18n/localization.ts';
import {
  bagFailureState,
  projectBagCart,
  type BagPresentationState,
  type BagReadyPresentation,
} from './bag-presentation.ts';

export type BagLoaderDependencies = Readonly<{
  bootstrap: Pick<StorefrontBootstrapService, 'load'>;
  cart: Pick<CartService, 'load'>;
  cartSessions: Pick<StorefrontCartSessionStore, 'get'>;
  locationId: string;
  loyalty?: Pick<LoyaltyService, 'getQuote'>;
}>;

type BagShell = Readonly<{
  fulfillmentLabel?: string;
  locationLabel: string;
  merchantLogoUrl?: string;
  merchantName: string;
}>;

const STORAGE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'SECURE_STORAGE_UNAVAILABLE',
  kind: 'unavailable',
  retryable: true,
});

const UNEXPECTED_FAILURE: StorefrontFailure = Object.freeze({
  code: 'UNEXPECTED_BAG_FAILURE',
  kind: 'unavailable',
  retryable: true,
});

const MAX_SHELL_TEXT = 500;

function safeShellText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 &&
    trimmed.length <= MAX_SHELL_TEXT &&
    !/[\u0000-\u001f\u007f]/.test(trimmed)
    ? trimmed
    : undefined;
}

function optionalHttpsUrl(value: unknown): string | undefined | false {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.toString()
      : false;
  } catch {
    return false;
  }
}

function projectShell(value: unknown): BagShell | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const location = Reflect.get(value, 'location');
  const merchant = Reflect.get(value, 'merchant');
  const readiness = Reflect.get(value, 'readiness');
  if (
    typeof location !== 'object' ||
    location === null ||
    typeof merchant !== 'object' ||
    merchant === null
  ) {
    return undefined;
  }
  const locationLabel = safeShellText(Reflect.get(location, 'addressString'));
  const merchantName = safeShellText(Reflect.get(merchant, 'name'));
  const merchantLogo = Reflect.get(merchant, 'logo');
  const locationLogo = Reflect.get(location, 'restaurantLogo');
  if (typeof merchantLogo !== 'string' || typeof locationLogo !== 'string') {
    return undefined;
  }
  const merchantLogoUrl = optionalHttpsUrl(
    merchantLogo || locationLogo,
  );
  if (
    !locationLabel ||
    !merchantName ||
    merchantLogoUrl === false
  ) {
    return undefined;
  }
  const fulfillmentLabel =
    typeof readiness === 'object' &&
    readiness !== null &&
    Reflect.get(readiness, 'fulfillmentMethod') === 'takeout'
      ? createTranslator('en')('bag.fulfillment.pickup')
      : undefined;
  return Object.freeze({
    ...(fulfillmentLabel ? { fulfillmentLabel } : {}),
    locationLabel,
    ...(merchantLogoUrl ? { merchantLogoUrl } : {}),
    merchantName,
  });
}

function shellFromReady(bag: BagReadyPresentation): BagShell {
  return Object.freeze({
    fulfillmentLabel: bag.fulfillmentLabel,
    locationLabel: bag.locationLabel,
    ...(bag.merchantLogoUrl ? { merchantLogoUrl: bag.merchantLogoUrl } : {}),
    merchantName: bag.merchantName,
  });
}

function empty(shell: BagShell): BagPresentationState {
  return Object.freeze({ ...shell, status: 'empty' as const });
}

async function projectCart(
  cart: StorefrontCart,
  dependencies: Pick<BagLoaderDependencies, 'loyalty'>,
  shell: BagShell,
): Promise<BagPresentationState> {
  if (cart.status === 'OPEN' && cart.totalQuantity === 0 && cart.items.length === 0) {
    return empty(shell);
  }

  let pointsToEarn: number | undefined;
  if (dependencies.loyalty) {
    try {
      const quote = await dependencies.loyalty.getQuote(cart.id);
      if (
        quote.kind === 'ready' &&
        quote.data.enabled &&
        quote.data.available !== false &&
        Number.isSafeInteger(quote.data.pointsToEarn) &&
        (quote.data.pointsToEarn ?? -1) >= 0
      ) {
        pointsToEarn = quote.data.pointsToEarn;
      }
    } catch {
      // Loyalty is optional bag decoration; authoritative cart truth remains usable.
    }
  }

  const projected = projectBagCart(cart, {
    locationAddress: shell.locationLabel,
    ...(shell.merchantLogoUrl ? { merchantLogoUrl: shell.merchantLogoUrl } : {}),
    merchantName: shell.merchantName,
    ...(pointsToEarn === undefined ? {} : { pointsToEarn }),
  });
  return projected ?? Object.freeze({ status: 'unavailable' as const });
}

async function resolveLoadResult(
  dependencies: BagLoaderDependencies,
  result: CartServiceResult,
  shell: BagShell,
  previous?: BagReadyPresentation,
): Promise<BagPresentationState> {
  if (result.kind === 'ready') return projectCart(result.cart, dependencies, shell);
  if (result.kind === 'failed') return bagFailureState(result.failure, previous, true);
  if (result.kind === 'terminal') {
    return result.reason === 'deleted' || result.reason === 'expired'
      ? empty(shell)
      : Object.freeze({ status: 'unavailable' });
  }
  if (result.kind === 'reconciliation_required' && result.cart) {
    return projectCart(result.cart, dependencies, shell);
  }
  return Object.freeze({ status: 'unavailable' });
}

export async function loadBag(
  dependencies: BagLoaderDependencies,
  intentId: string,
): Promise<BagPresentationState> {
  let session;
  try {
    session = await dependencies.cartSessions.get(dependencies.locationId);
  } catch {
    return bagFailureState(STORAGE_FAILURE);
  }

  try {
    const bootstrap = await dependencies.bootstrap.load();
    if (bootstrap.kind === 'failed') return bagFailureState(bootstrap.failure);
    const shell = projectShell(bootstrap.data);
    if (!shell) return Object.freeze({ status: 'unavailable' });
    if (!session) return empty(shell);

    return resolveLoadResult(
      dependencies,
      await dependencies.cart.load({ id: intentId }),
      shell,
    );
  } catch {
    return bagFailureState(UNEXPECTED_FAILURE);
  }
}

export async function retryBagLoad(
  dependencies: BagLoaderDependencies,
  cart: Pick<CartService, 'retry'>,
  previous?: BagReadyPresentation,
): Promise<BagPresentationState> {
  try {
    const bootstrap = await dependencies.bootstrap.load();
    if (bootstrap.kind === 'failed') return bagFailureState(bootstrap.failure, previous);
    const shell = projectShell(bootstrap.data);
    if (!shell) return Object.freeze({ status: 'unavailable' });
    return resolveLoadResult(dependencies, await cart.retry(), shell, previous);
  } catch {
    return bagFailureState(UNEXPECTED_FAILURE, previous, true);
  }
}

export async function resolveBagMutation(
  dependencies: Pick<BagLoaderDependencies, 'loyalty'>,
  result: CartServiceResult,
  previous: BagReadyPresentation,
): Promise<BagPresentationState> {
  const shell = shellFromReady(previous);
  if (result.kind === 'ready') return projectCart(result.cart, dependencies, shell);
  if (result.kind === 'reconciliation_required') {
    if (!result.cart) return bagFailureState(result.failure);
    const reconciled = await projectCart(result.cart, dependencies, shell);
    return reconciled.status === 'ready'
      ? Object.freeze({ previous: reconciled, retry: 'new_intent', status: 'error' })
      : reconciled;
  }
  if (result.kind === 'failed') return bagFailureState(result.failure, previous, true);
  if (result.kind === 'terminal') {
    return result.reason === 'deleted' || result.reason === 'expired'
      ? empty(shell)
      : Object.freeze({ status: 'unavailable' });
  }
  return Object.freeze({ status: 'unavailable' });
}
