import type { PublicOrderDetail } from '@craveup/storefront-sdk';

export function createStorefrontOrderFixture(
  overrides: Partial<PublicOrderDetail> = {},
): PublicOrderDetail {
  return {
    createdAt: '2099-01-01T10:00:00.000Z',
    currency: 'usd',
    deliveryInfo: null,
    fulfillmentIdentifier: '',
    fulfillmentMethod: 'takeout',
    id: 'order_fixture',
    items: [],
    orderDate: '2099-01-01',
    orderTime: '10:30 AM - 10:45 AM',
    orderTotal: '0.00',
    partiallyRefunded: false,
    payment: null,
    pickupType: 'ASAP',
    pricing: {
      discount: '0.00',
      enterpriseFee: '0.00',
      fulfillmentFee: '0.00',
      netPaid: '0.00',
      refunded: '0.00',
      serviceFee: '0.00',
      subtotal: '0.00',
      tax: '0.00',
      tip: '0.00',
      total: '0.00',
    },
    restaurantDisplayName: 'Fixture Merchant',
    roomServiceInfo: null,
    shortId: 'FIXTURE',
    status: 'COMPLETED',
    tableServiceInfo: null,
    totalQuantity: 0,
    updatedAt: '2099-01-01T10:15:00.000Z',
    ...overrides,
  };
}
