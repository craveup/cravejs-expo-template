import type { BrandConfig, CapabilityName } from '../config/brand.types.ts';

export type RouteSurface = 'tab' | 'stack' | 'modal' | 'system';

export type RouteDefinition = {
  allowedQueryKeys: readonly string[];
  capability?: CapabilityName;
  deepLink: boolean;
  id: string;
  path: string;
  surface: RouteSurface;
};

export const ROUTE_INVENTORY = [
  { id: 'home', path: '/', surface: 'tab', deepLink: true, allowedQueryKeys: [] },
  {
    id: 'onboarding',
    path: '/onboarding',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
  },
  { id: 'menu', path: '/menu', surface: 'tab', deepLink: true, allowedQueryKeys: [] },
  {
    id: 'item',
    path: '/item/:productId',
    surface: 'stack',
    deepLink: true,
    allowedQueryKeys: [],
  },
  {
    id: 'nutrition',
    path: '/item/:productId/nutrition',
    surface: 'stack',
    deepLink: true,
    allowedQueryKeys: [],
  },
  {
    id: 'build',
    path: '/build/:productId',
    surface: 'stack',
    deepLink: true,
    allowedQueryKeys: [],
  },
  { id: 'search', path: '/search', surface: 'modal', deepLink: true, allowedQueryKeys: ['q'] },
  { id: 'bag', path: '/bag', surface: 'tab', deepLink: true, allowedQueryKeys: [] },
  {
    id: 'fulfillment',
    path: '/fulfillment',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
  },
  {
    id: 'storeClosed',
    path: '/store-closed',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
  },
  {
    id: 'pickupSchedule',
    path: '/schedule',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
  },
  {
    id: 'checkout',
    path: '/checkout',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
  },
  {
    id: 'bagClear',
    path: '/bag-clear',
    surface: 'modal',
    deepLink: false,
    allowedQueryKeys: [],
  },
  {
    id: 'bagRemoveItem',
    path: '/bag-remove-item',
    surface: 'modal',
    deepLink: false,
    allowedQueryKeys: [],
  },
  { id: 'locations', path: '/locations', surface: 'modal', deepLink: true, allowedQueryKeys: [] },
  {
    id: 'locationDetail',
    path: '/locations/:locationId',
    surface: 'stack',
    deepLink: true,
    allowedQueryKeys: [],
  },
  { id: 'account', path: '/account', surface: 'stack', deepLink: true, allowedQueryKeys: [] },
  { id: 'signIn', path: '/sign-in', surface: 'stack', deepLink: true, allowedQueryKeys: [] },
  {
    id: 'signInVerify',
    path: '/sign-in/verify',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
  },
  {
    id: 'deliveryAddress',
    path: '/delivery/address',
    surface: 'stack',
    deepLink: true,
    allowedQueryKeys: [],
  },
  {
    id: 'deliveryStatus',
    path: '/delivery/status',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
  },
  {
    id: 'rewards',
    path: '/rewards',
    surface: 'tab',
    deepLink: true,
    allowedQueryKeys: [],
    capability: 'loyalty',
  },
  {
    id: 'rewardRedeem',
    path: '/rewards/redeem/:rewardId',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
    capability: 'loyalty',
  },
  {
    id: 'rewardsHistory',
    path: '/rewards/history',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
    capability: 'loyalty',
  },
  {
    id: 'favourites',
    path: '/favourites',
    surface: 'stack',
    deepLink: true,
    allowedQueryKeys: [],
    capability: 'favourites',
  },
  {
    id: 'claims',
    path: '/claims',
    surface: 'stack',
    deepLink: true,
    allowedQueryKeys: [],
    capability: 'claims',
  },
  {
    id: 'savedCards',
    path: '/payments',
    surface: 'stack',
    deepLink: true,
    allowedQueryKeys: [],
    capability: 'savedCards',
  },
  {
    id: 'orderStatus',
    path: '/order/status',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
  },
  {
    id: 'orderHistory',
    path: '/orders',
    surface: 'stack',
    deepLink: false,
    allowedQueryKeys: [],
  },
  {
    id: 'order',
    path: '/order/:orderId',
    surface: 'stack',
    deepLink: true,
    allowedQueryKeys: [],
  },
  {
    id: 'receipt',
    path: '/receipt/:receiptId',
    surface: 'stack',
    deepLink: true,
    allowedQueryKeys: [],
  },
  {
    id: 'offline',
    path: '/offline',
    surface: 'system',
    deepLink: false,
    allowedQueryKeys: [],
  },
  {
    id: 'error',
    path: '/error',
    surface: 'system',
    deepLink: false,
    allowedQueryKeys: [],
  },
] as const satisfies readonly RouteDefinition[];

export type RouteId = (typeof ROUTE_INVENTORY)[number]['id'];

export function isRouteAvailable(
  route: RouteDefinition,
  capabilities: BrandConfig['capabilities'],
): boolean {
  return route.capability === undefined || capabilities[route.capability] === 'enabled';
}

export function getAvailableRoutes(config: BrandConfig): readonly RouteDefinition[] {
  return ROUTE_INVENTORY.filter((route) => isRouteAvailable(route, config.capabilities));
}
