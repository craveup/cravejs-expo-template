import type { DistanceRequest } from '@craveup/storefront-sdk';

import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import type {
  LocationDirectoryResult,
  LocationDirectoryService,
  LocationDirectorySnapshot,
} from './location-directory-service.ts';

export type LocationDirectoryRouteLoad = Readonly<{
  data?: LocationDirectorySnapshot;
  errorMessage?: string;
}>;

export type LocationDirectoryRouteState =
  | 'directory'
  | 'error'
  | 'loading'
  | 'no-published-locations';

export function getLocationDirectoryRouteState(
  load?: LocationDirectoryRouteLoad,
): LocationDirectoryRouteState {
  if (!load) return 'loading';
  if (load.errorMessage) return 'error';
  if (load.data?.locations.length === 0) return 'no-published-locations';
  return load.data ? 'directory' : 'loading';
}

export async function loadLocationDirectoryProgressively(
  directory: Pick<LocationDirectoryService, 'list'>,
  getOrigin: () => Promise<DistanceRequest | undefined>,
  publish: (result: LocationDirectoryResult) => void,
): Promise<void> {
  const initial = await directory.list();
  publish(initial);
  if (initial.kind !== 'ready' || initial.data.locations.length === 0) return;

  try {
    const origin = await getOrigin();
    if (!origin) return;

    const enriched = await directory.list(origin);
    if (enriched.kind === 'ready') publish(enriched);
  } catch {
    // Distance is optional; the already-published directory stays usable.
  }
}

export function getLocationDirectoryFailureMessage(
  failure: StorefrontFailure,
): string {
  if (failure.kind === 'not_found') return 'No pickup locations are available.';
  if (failure.kind === 'timeout' || failure.kind === 'unavailable') {
    return 'We could not load stores. Check your connection and try again.';
  }
  return 'We could not load stores. Try again.';
}
