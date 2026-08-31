import type { Product } from '@craveup/storefront-sdk';

import {
  projectCatalogSnapshot,
  type CatalogBrowseSnapshot,
} from '../catalog/catalog-browse.ts';
import type { CartService, CartServiceResult } from '../../lib/cart.ts';
import { mapStorefrontError } from '../../lib/storefront-errors.ts';
import type { StorefrontBootstrapService } from '../../lib/storefront-bootstrap-service.ts';
import type { StorefrontClient } from '../../lib/storefront.ts';
import { isScopedStorefrontProduct } from '../../lib/storefront-response-contracts.ts';
import type {
  FavouriteResolution,
  FavouritesStore,
} from './favourites-store.ts';

export type FavouritesNetworkState = Readonly<{
  isConnected?: boolean;
  isInternetReachable?: boolean;
}>;

export type FavouritesRouteFailureStatus =
  | 'error'
  | 'offline'
  | 'unavailable';

export type FavouritesRouteLoadResult =
  | Readonly<{
      canAdd: boolean;
      kind: 'ready';
      resolutions: readonly FavouriteResolution[];
    }>
  | Readonly<{
      kind: 'failed';
      status: FavouritesRouteFailureStatus;
    }>;

export type FavouriteCartIntentIds = Readonly<{
  add: string;
  start: string;
}>;

export type FavouriteCartRetryPhase = 'add' | 'start';

export type FavouriteCartSubmissionResult =
  | Readonly<{ kind: 'added' }>
  | Readonly<{ kind: 'refresh_required' }>
  | Readonly<{
      kind: 'retryable';
      retry: 'new_intent' | 'same_intent';
      phase?: FavouriteCartRetryPhase;
    }>
  | Readonly<{ kind: 'unavailable' }>;

type FavouriteProductsClient = Pick<StorefrontClient['products'], 'get'>;

export type FavouritesRouteDependencies = Readonly<{
  bootstrap: StorefrontBootstrapService;
  favourites: FavouritesStore;
  locationId: string;
  products: FavouriteProductsClient;
}>;

type ReadyFavouriteResolution = Extract<
  FavouriteResolution,
  Readonly<{ kind: 'ready' }>
>;

const PRODUCT_CONCURRENCY = 4;

function activeCatalogProductIds(
  catalog: CatalogBrowseSnapshot,
): ReadonlySet<string> {
  const productIds = new Set(
    catalog.popularProducts.map((product) => product.id),
  );
  for (const section of catalog.sections) {
    for (const product of section.products) productIds.add(product.id);
  }
  return productIds;
}

async function loadProducts(
  client: FavouriteProductsClient,
  locationId: string,
  productIds: readonly string[],
): Promise<
  | Readonly<{ kind: 'ready'; products: readonly Product[] }>
  | Readonly<{ kind: 'failed'; status: FavouritesRouteFailureStatus }>
> {
  const products: Product[] = [];
  let nextIndex = 0;
  let failure: FavouritesRouteFailureStatus | undefined;

  async function worker(): Promise<void> {
    while (!failure) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= productIds.length) return;

      const productId = productIds[index]!;
      try {
        const product = await client.get(locationId, productId);
        if (!isScopedStorefrontProduct(product, locationId, productId)) {
          failure = 'unavailable';
          return;
        }
        products[index] = product;
      } catch (error) {
        const mapped = mapStorefrontError(error);
        if (mapped.kind !== 'not_found') {
          failure = mapped.kind === 'unavailable' ? 'unavailable' : 'error';
          return;
        }
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PRODUCT_CONCURRENCY, productIds.length) },
      () => worker(),
    ),
  );

  return failure
    ? Object.freeze({ kind: 'failed', status: failure })
    : Object.freeze({
        kind: 'ready',
        products: Object.freeze(products.filter(Boolean)),
      });
}

export function isFavouritesOffline(
  network: FavouritesNetworkState,
): boolean {
  return (
    network.isConnected === false || network.isInternetReachable === false
  );
}

export async function loadFavouritesRoute(
  dependencies: FavouritesRouteDependencies,
  network: FavouritesNetworkState,
): Promise<FavouritesRouteLoadResult> {
  let saved;
  try {
    saved = await dependencies.favourites.list();
  } catch {
    return Object.freeze({ kind: 'failed', status: 'unavailable' });
  }

  if (saved.length === 0) {
    return Object.freeze({
      canAdd: false,
      kind: 'ready',
      resolutions: Object.freeze([]),
    });
  }
  if (isFavouritesOffline(network)) {
    return Object.freeze({ kind: 'failed', status: 'offline' });
  }

  let bootstrap;
  try {
    bootstrap = await dependencies.bootstrap.load();
  } catch {
    return Object.freeze({ kind: 'failed', status: 'error' });
  }
  if (bootstrap.kind === 'failed') {
    return Object.freeze({
      kind: 'failed',
      status:
        bootstrap.failure.kind === 'not_found' ||
        bootstrap.failure.kind === 'unavailable'
          ? 'unavailable'
          : 'error',
    });
  }

  const catalog = projectCatalogSnapshot(bootstrap.data);
  if (!catalog.ok) {
    return Object.freeze({ kind: 'failed', status: 'unavailable' });
  }
  const catalogIds = activeCatalogProductIds(catalog.snapshot);
  const productIds = [
    ...new Set(
      saved
        .map((favourite) => favourite.productId)
        .filter((productId) => catalogIds.has(productId)),
    ),
  ];
  const loaded = await loadProducts(
    dependencies.products,
    dependencies.locationId,
    productIds,
  );
  if (loaded.kind === 'failed') return loaded;

  try {
    return Object.freeze({
      canAdd: catalog.snapshot.canStartOrder,
      kind: 'ready',
      resolutions: await dependencies.favourites.resolve(loaded.products),
    });
  } catch {
    return Object.freeze({ kind: 'failed', status: 'unavailable' });
  }
}

export function createFavouriteCartIntentKey(
  phase: FavouriteCartRetryPhase,
  now: number,
  sequence: number,
): string {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  ) {
    throw new Error('Cannot create favourite cart intent key.');
  }
  return `favourite_${phase}_${now.toString(36)}_${sequence.toString(36)}`;
}

function classifyCartResult(
  cart: CartService,
  result: CartServiceResult,
  phase: FavouriteCartRetryPhase,
): FavouriteCartSubmissionResult {
  if (result.kind === 'reconciliation_required') {
    return Object.freeze({ kind: 'refresh_required' });
  }
  if (result.kind === 'terminal') {
    return Object.freeze({ kind: 'retryable', retry: 'new_intent' });
  }
  if (result.kind === 'failed') {
    const state = cart.getState();
    if (state.status === 'error' && state.retry === 'same_intent') {
      return Object.freeze({ kind: 'retryable', phase, retry: 'same_intent' });
    }
    return result.failure.retryable
      ? Object.freeze({ kind: 'retryable', retry: 'new_intent' })
      : Object.freeze({ kind: 'unavailable' });
  }
  return Object.freeze({ kind: 'unavailable' });
}

async function addToReadyCart(
  cart: CartService,
  resolution: ReadyFavouriteResolution,
  intents: FavouriteCartIntentIds,
): Promise<FavouriteCartSubmissionResult> {
  const result = await cart.addItem({
    id: intents.add,
    payload: resolution.cartIntent,
  });
  return result.kind === 'ready'
    ? Object.freeze({ kind: 'added' })
    : classifyCartResult(cart, result, 'add');
}

export async function submitFavouriteToCart(
  cart: CartService,
  resolution: ReadyFavouriteResolution,
  intents: FavouriteCartIntentIds,
  retryPhase?: FavouriteCartRetryPhase,
): Promise<FavouriteCartSubmissionResult> {
  if (retryPhase) {
    const retried = await cart.retry();
    if (retried.kind !== 'ready') {
      return classifyCartResult(cart, retried, retryPhase);
    }
    return retryPhase === 'add'
      ? Object.freeze({ kind: 'added' })
      : addToReadyCart(cart, resolution, intents);
  }

  let state = cart.getState();
  if (state.status === 'error' && state.retry !== 'same_intent') {
    cart.dismissError();
    state = cart.getState();
  }

  if (state.status === 'idle' || state.status === 'terminal') {
    const started = await cart.start({
      channel: 'app',
      fulfillmentMethod: 'takeout',
      id: intents.start,
    });
    if (started.kind !== 'ready') {
      return classifyCartResult(cart, started, 'start');
    }
  } else if (state.status !== 'ready') {
    return Object.freeze({ kind: 'unavailable' });
  }

  return addToReadyCart(cart, resolution, intents);
}
