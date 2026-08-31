import type { CatalogBrowseState } from './catalog-browse.ts';

export type CatalogNetworkState = Readonly<{
  isConnected?: boolean;
  isInternetReachable?: boolean;
}>;

export type CatalogBrowseEvent =
  | Readonly<{ type: 'load' }>
  | Readonly<{ type: 'offline' }>
  | Readonly<{ state: CatalogBrowseState; type: 'resolve' }>;

export function isCatalogOffline(network: CatalogNetworkState): boolean {
  return (
    network.isConnected === false || network.isInternetReachable === false
  );
}

export function isCatalogBrowsePath(pathname: string): boolean {
  return pathname === '/' || pathname === '/menu' || pathname === '/search';
}

export function shouldLoadCatalogBrowse(
  active: boolean,
  network: CatalogNetworkState,
): boolean {
  return active && !isCatalogOffline(network);
}

export function catalogBrowseReducer(
  state: CatalogBrowseState,
  event: CatalogBrowseEvent,
): CatalogBrowseState {
  if (event.type === 'load') return Object.freeze({ status: 'loading' });
  if (event.type === 'offline') return Object.freeze({ status: 'offline' });
  return event.state;
}
