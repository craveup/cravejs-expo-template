import type {
  DistanceResponse,
  Menu,
  MenuProduct,
  MerchantApiResponse,
  OrderTimesResponse,
  Product,
  StorefrontLocation,
} from '@craveup/storefront-sdk';

export const CANONICAL_STOREFRONT_FIXTURE_PROFILE =
  'canonical-storefront-v1' as const;

export type StorefrontFixtureScope = Readonly<{
  environmentNamespace: string;
  locationId: string;
  merchantSlug: string;
}>;

export type CanonicalStorefrontFixture = {
  distances: DistanceResponse[];
  location: StorefrontLocation;
  menus: Menu[];
  merchant: MerchantApiResponse;
  orderTimes: OrderTimesResponse;
  products: Product[];
  profile: typeof CANONICAL_STOREFRONT_FIXTURE_PROFILE;
  scope: StorefrontFixtureScope;
};

export function createCanonicalStorefrontFixture(): CanonicalStorefrontFixture {
  const locationId = '0123456789abcdef01234567';
  const locationName = 'Fixture Merchant';
  const addressString = '100 Example Avenue, Sample City';
  const coordinates = { lat: 34.017, lng: -118.499 };
  const milkModifier = {
    id: 'modifier-milk',
    items: [
      {
        id: 'modifier-option-whole-milk',
        maxQuantity: 1,
        name: 'Whole milk',
        price: '0.00',
      },
      {
        id: 'modifier-option-oat-milk',
        maxQuantity: 1,
        name: 'Oat milk',
        price: '0.75',
      },
    ],
    name: 'Milk',
    rule: { max: 1, min: 1 },
  } satisfies Product['modifiers'][number];
  const products = [
    {
      availability: 'AVAILABLE',
      currency: 'usd',
      description: 'A deterministic fixture product with no modifiers.',
      displayPrice: '$4.00',
      id: 'product-basic',
      images: [],
      locationId,
      modifierIds: [],
      modifiers: [],
      name: 'Fixture Product',
      price: '4.00',
    },
    {
      availability: 'AVAILABLE',
      currency: 'usd',
      description: 'A deterministic fixture product with one published modifier group.',
      displayPrice: '$5.00',
      id: 'product-customizable',
      images: [],
      locationId,
      modifierIds: [milkModifier.id],
      modifiers: [milkModifier],
      name: 'Fixture Customizable Product',
      price: '5.00',
    },
  ] satisfies Product[];
  const menuProducts = products.map(
    (product): MenuProduct => ({
      availability: product.availability,
      currency: product.currency,
      description: product.description,
      displayPrice: product.displayPrice,
      id: product.id,
      images: product.images,
      modifierIds: product.modifierIds,
      name: product.name,
      price: product.price,
    }),
  );

  return {
    distances: [
      {
        distance: {
          kilometers: 0.64,
          miles: 0.4,
          unit: 'miles',
          value: 0.4,
        },
        location: {
          addressString,
          coordinates,
          id: locationId,
          restaurantDisplayName: locationName,
        },
        locationId,
      },
    ],
    location: {
      addressData: {
        city: 'Sample City',
        country: 'US',
        lat: coordinates.lat,
        lng: coordinates.lng,
        state: 'CA',
        street: '100 Example Avenue',
        zipCode: '90000',
      },
      addressString,
      coverPhoto: '',
      id: locationId,
      restaurantBio: 'Deterministic zero-network presentation fixture.',
      restaurantDisplayName: locationName,
      restaurantLogo: '',
      restaurantSlug: 'fixture-merchant',
    },
    menus: [
      {
        categories: [
          {
            id: 'category-main',
            name: 'Menu',
            products: menuProducts,
          },
        ],
        id: 'menu-all-day',
        isActive: true,
        name: 'All day',
        time: 'All day',
      },
    ],
    merchant: {
      bio: 'Deterministic zero-network presentation fixture.',
      country: 'US',
      cover: '',
      currency: 'USD',
      id: 'merchant-fixture',
      locations: [
        {
          addressString,
          coverPhoto: '',
          id: locationId,
          lat: coordinates.lat,
          lng: coordinates.lng,
          methodsStatus: {
            delivery: false,
            pickup: true,
            roomService: false,
            table: false,
          },
          restaurantBio: 'Deterministic zero-network presentation fixture.',
          restaurantDisplayName: locationName,
          restaurantLogo: '',
        },
      ],
      logo: '',
      name: locationName,
    },
    orderTimes: {
      orderDays: [
        {
          intervals: ['10:30 AM - 10:45 AM', '10:45 AM - 11:00 AM'],
          label: 'Fixture day',
          value: '2099-01-01',
        },
      ],
      requireScheduledOrders: true,
      scheduleAllowed: true,
    },
    products,
    profile: CANONICAL_STOREFRONT_FIXTURE_PROFILE,
    scope: {
      environmentNamespace: 'env-edba1d5cf699b81a',
      locationId,
      merchantSlug: 'fixture-merchant',
    },
  };
}
