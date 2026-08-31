import type { BrandConfig } from '../config/brand.types.ts';

import { ROUTE_INVENTORY, isRouteAvailable, type RouteDefinition, type RouteId } from './routes.ts';

export type NavigationIntent = {
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
  routeId: RouteId;
};

export type SensitiveLinkHandoff = {
  kind: 'receipt-capability-fragment';
  value: string;
};

export type SafeLinkFailureReason =
  | 'capability_unavailable'
  | 'foreign_origin'
  | 'invalid_parameter'
  | 'invalid_url'
  | 'route_not_found'
  | 'unexpected_fragment'
  | 'unexpected_query';

export type SafeLinkResult =
  | {
      intent: NavigationIntent;
      ok: true;
      sanitizedUrl: string;
      sensitive?: SensitiveLinkHandoff;
    }
  | { ok: false; reason: SafeLinkFailureReason };

const SAFE_PARAMETER = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_QUERY_LENGTH = 120;
const MAX_FRAGMENT_LENGTH = 2048;

function normalizePath(url: URL, customScheme: boolean): string {
  const customHost = customScheme && url.hostname ? `/${url.hostname}` : '';
  const combined = `${customHost}${url.pathname || '/'}`;
  if (combined.length > 1 && combined.endsWith('/')) return combined.slice(0, -1);
  return combined;
}

type RouteMatch =
  | { kind: 'invalid-parameter' }
  | { kind: 'match'; params: Readonly<Record<string, string>> }
  | { kind: 'no-match' };

function matchRoute(path: string, route: RouteDefinition): RouteMatch {
  const routeSegments = route.path.split('/').filter(Boolean);
  const pathSegments = path.split('/').filter(Boolean);
  if (route.path === '/' && path === '/') return { kind: 'match', params: {} };
  if (routeSegments.length !== pathSegments.length) return { kind: 'no-match' };

  const params: Record<string, string> = {};
  for (let index = 0; index < routeSegments.length; index += 1) {
    const expected = routeSegments[index];
    const supplied = pathSegments[index];
    if (expected.startsWith(':')) {
      let decoded;
      try {
        decoded = decodeURIComponent(supplied);
      } catch {
        return { kind: 'invalid-parameter' };
      }
      if (!SAFE_PARAMETER.test(decoded)) return { kind: 'invalid-parameter' };
      params[expected.slice(1)] = decoded;
    } else if (expected !== supplied) {
      return { kind: 'no-match' };
    }
  }
  return { kind: 'match', params };
}

type QueryResult =
  | { ok: true; query: Readonly<Record<string, string>> }
  | { ok: false; reason: 'invalid_parameter' | 'unexpected_query' };

function readQuery(url: URL, route: RouteDefinition): QueryResult {
  const query: Record<string, string> = {};
  for (const key of url.searchParams.keys()) {
    if (!route.allowedQueryKeys.includes(key) || url.searchParams.getAll(key).length !== 1) {
      return { ok: false, reason: 'unexpected_query' };
    }
    const value = url.searchParams.get(key) ?? '';
    if (!value || value.length > MAX_QUERY_LENGTH) return { ok: false, reason: 'invalid_parameter' };
    query[key] = value;
  }
  return { ok: true, query };
}

function hasAllowedOrigin(url: URL, config: BrandConfig): { allowed: boolean; customScheme: boolean } {
  if (url.username || url.password || url.port) return { allowed: false, customScheme: false };
  const customScheme = url.protocol === `${config.scheme}:`;
  if (customScheme) return { allowed: true, customScheme };
  const hosts = new Set([
    ...config.links.universalLinkHosts,
    ...config.links.androidAppLinkHosts,
  ]);
  return { allowed: url.protocol === 'https:' && hosts.has(url.hostname), customScheme: false };
}

export function parseSafeLink(input: string, config: BrandConfig): SafeLinkResult {
  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  const origin = hasAllowedOrigin(url, config);
  if (!origin.allowed) return { ok: false, reason: 'foreign_origin' };
  const path = normalizePath(url, origin.customScheme);
  const candidates = ROUTE_INVENTORY.filter((route) => route.deepLink);

  for (const route of candidates) {
    const match = matchRoute(path, route);
    if (match.kind === 'no-match') continue;
    if (match.kind === 'invalid-parameter') return { ok: false, reason: 'invalid_parameter' };
    if (!isRouteAvailable(route, config.capabilities)) {
      return { ok: false, reason: 'capability_unavailable' };
    }
    const queryResult = readQuery(url, route);
    if (!queryResult.ok) return queryResult;

    let sensitive;
    if (url.hash) {
      if (route.id !== 'receipt' || url.hash.length <= 1 || url.hash.length > MAX_FRAGMENT_LENGTH + 1) {
        return { ok: false, reason: 'unexpected_fragment' };
      }
      sensitive = { kind: 'receipt-capability-fragment', value: url.hash.slice(1) } as const;
      url.hash = '';
    }

    return {
      ok: true,
      intent: { params: match.params, query: queryResult.query, routeId: route.id },
      sanitizedUrl: url.toString(),
      ...(sensitive ? { sensitive } : {}),
    };
  }
  return { ok: false, reason: 'route_not_found' };
}
