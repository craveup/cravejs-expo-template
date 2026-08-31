import type {
  PublicOrderDetail,
  PublicOrderSummary,
} from '@craveup/storefront-sdk';

import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import type { OrderAccessService } from './order-access-service.ts';

export type HydratedOrderHistoryPage = Readonly<{
  details: readonly PublicOrderDetail[];
  nextCursor?: string;
  summaries: readonly PublicOrderSummary[];
}>;

export type OrderHistoryPageResult =
  | Readonly<{ data: HydratedOrderHistoryPage; kind: 'ready' }>
  | Readonly<{ failure: StorefrontFailure; kind: 'failed' }>;

export type OrderHistoryNetworkState = Readonly<{
  isConnected?: boolean;
  isInternetReachable?: boolean;
}>;

const DETAIL_CONCURRENCY = 4;

export function isOrderHistoryOffline(
  network: OrderHistoryNetworkState,
): boolean {
  return (
    network.isConnected === false || network.isInternetReachable === false
  );
}

export function getNextOrderHistoryCursor(
  returnedCursor: string | undefined,
  consumedCursors: ReadonlySet<string>,
): string | undefined {
  return returnedCursor && !consumedCursors.has(returnedCursor)
    ? returnedCursor
    : undefined;
}

export async function loadOrderHistoryPage(
  service: Pick<OrderAccessService, 'getOrder' | 'listOrders'>,
  params: Readonly<{ cursor?: string; limit?: number }> = {},
): Promise<OrderHistoryPageResult> {
  const pageResult = await service.listOrders(params);
  if (pageResult.kind === 'failed') return pageResult;

  const uniqueSummaries = Array.from(
    new Map(pageResult.data.items.map((summary) => [summary.id, summary])).values(),
  );
  const detailsById = new Map<string, PublicOrderDetail>();
  let nextIndex = 0;
  let authenticationFailure: StorefrontFailure | undefined;

  async function hydrateNext(): Promise<void> {
    while (!authenticationFailure) {
      const index = nextIndex;
      nextIndex += 1;
      const summary = uniqueSummaries[index];
      if (!summary) return;

      const detailResult = await service.getOrder(summary.id);
      if (detailResult.kind === 'ready') {
        if (detailResult.data.id === summary.id) {
          detailsById.set(summary.id, detailResult.data);
        }
        continue;
      }

      if (detailResult.failure.kind === 'authentication_required') {
        authenticationFailure = detailResult.failure;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(DETAIL_CONCURRENCY, uniqueSummaries.length) },
      () => hydrateNext(),
    ),
  );

  if (authenticationFailure) {
    return Object.freeze({ failure: authenticationFailure, kind: 'failed' });
  }

  const details = uniqueSummaries.flatMap((summary) => {
    const detail = detailsById.get(summary.id);
    return detail ? [detail] : [];
  });

  return Object.freeze({
    data: Object.freeze({
      details: Object.freeze(details),
      ...(pageResult.data.nextCursor
        ? { nextCursor: pageResult.data.nextCursor }
        : {}),
      summaries: Object.freeze(uniqueSummaries),
    }),
    kind: 'ready',
  });
}
