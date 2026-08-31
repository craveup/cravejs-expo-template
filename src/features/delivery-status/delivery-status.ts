import { formatDate, type AppLocale } from '../../i18n/localization.ts';
import type { ActiveOrderStatusService } from '../order-status/order-status-loader.ts';
import type { OrderStatusPresentationState } from '../order-status/order-status-presentation.ts';

export type DeliveryStatusReadyData = Readonly<{
  addressLabel?: string;
  createdAtLabel: string;
  orderLabel: string;
  statusLabel: string;
  updatedAtLabel?: string;
}>;

type NonCompletedOrderStatus = Exclude<
  OrderStatusPresentationState['status'],
  'completed'
>;
type CompletedOrderStatusState = Extract<
  OrderStatusPresentationState,
  { status: 'completed' }
>;

export type DeliveryStatusPresentationState =
  | Readonly<{ status: NonCompletedOrderStatus }>
  | Readonly<{ data: DeliveryStatusReadyData; status: 'ready' }>;

const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({
  dateStyle: 'medium',
  timeStyle: 'short',
});
const deliveryStatusHandoffs = new WeakMap<
  ActiveOrderStatusService,
  CompletedOrderStatusState
>();

function nonempty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function isDeliveryStatusOrder(
  state: OrderStatusPresentationState,
): state is Extract<OrderStatusPresentationState, { status: 'completed' }> {
  return (
    state.status === 'completed' &&
    state.order.tracking.fulfillmentMethod.trim().toLowerCase() === 'delivery'
  );
}

export function handoffDeliveryStatus(
  orders: ActiveOrderStatusService,
  state: OrderStatusPresentationState,
  navigate: () => void,
): boolean {
  if (!isDeliveryStatusOrder(state)) return false;

  deliveryStatusHandoffs.set(orders, state);
  try {
    navigate();
  } catch (error) {
    clearDeliveryStatusHandoff(orders, state);
    throw error;
  }
  return true;
}

export function readDeliveryStatusHandoff(
  orders: ActiveOrderStatusService,
): CompletedOrderStatusState | undefined {
  return deliveryStatusHandoffs.get(orders);
}

export function clearDeliveryStatusHandoff(
  orders: ActiveOrderStatusService,
  expected: CompletedOrderStatusState,
): void {
  if (deliveryStatusHandoffs.get(orders) === expected) {
    deliveryStatusHandoffs.delete(orders);
  }
}

export function selectDeliveryStatusSourceState(
  current: OrderStatusPresentationState,
  remembered?: CompletedOrderStatusState,
): OrderStatusPresentationState {
  return current.status === 'loading' || current.status === 'no_active_order'
    ? (remembered ?? current)
    : current;
}

export function toDeliveryStatusPresentationState(
  state: OrderStatusPresentationState,
  locale: AppLocale = 'en',
): DeliveryStatusPresentationState {
  if (state.status !== 'completed') {
    return Object.freeze({ status: state.status });
  }

  if (!isDeliveryStatusOrder(state)) {
    return Object.freeze({ status: 'unavailable' });
  }

  const tracking = state.order.tracking;
  const statusLabel = nonempty(tracking.status);
  const orderLabel = nonempty(state.order.orderLabel);
  const createdAtLabel = formatDate(
    locale,
    tracking.createdAt,
    TIMESTAMP_FORMAT,
  );
  if (!orderLabel || !statusLabel || !createdAtLabel) {
    return Object.freeze({ status: 'unavailable' });
  }

  const updatedAtLabel = tracking.updatedAt
    ? formatDate(locale, tracking.updatedAt, TIMESTAMP_FORMAT)
    : null;
  const addressLabel = nonempty(tracking.deliveryAddress);

  return Object.freeze({
    data: Object.freeze({
      ...(addressLabel ? { addressLabel } : {}),
      createdAtLabel,
      orderLabel,
      statusLabel,
      ...(updatedAtLabel ? { updatedAtLabel } : {}),
    }),
    status: 'ready',
  });
}
