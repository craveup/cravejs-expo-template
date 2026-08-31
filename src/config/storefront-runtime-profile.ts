import { brandConfig } from './brand.config.ts';
import type { BrandConfig, CapabilityName } from './brand.types.ts';
import {
  parsePublicEnvironment,
  readPublicEnvironment,
  type PublicEnvironmentConfig,
  type PublicEnvironmentInput,
} from './public-env.ts';

type StorefrontRuntimeProfileField =
  | 'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY'
  | 'EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY';

export type StorefrontRuntimeProfile = Readonly<{
  capabilities: BrandConfig['capabilities'];
  environment: PublicEnvironmentConfig;
}>;

export class StorefrontRuntimeProfileError extends Error {
  readonly capability: CapabilityName;
  readonly field: StorefrontRuntimeProfileField;

  constructor(
    capability: CapabilityName,
    field: StorefrontRuntimeProfileField,
    reason: string,
  ) {
    super(`Invalid ${capability} runtime profile for ${field}: ${reason}`);
    this.name = 'StorefrontRuntimeProfileError';
    this.capability = capability;
    this.field = field;
  }
}

function validateDeliveryConfiguration(
  brand: BrandConfig,
  environment: PublicEnvironmentConfig,
): void {
  if (brand.capabilities.delivery !== 'enabled') return;

  if (!environment.maps.iosApiKey) {
    throw new StorefrontRuntimeProfileError(
      'delivery',
      'EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY',
      'enabled delivery requires an iOS application-restricted key',
    );
  }
  if (!environment.maps.androidApiKey) {
    throw new StorefrontRuntimeProfileError(
      'delivery',
      'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY',
      'enabled delivery requires an Android application-restricted key',
    );
  }
}

export function createStorefrontRuntimeProfile(
  brand: BrandConfig,
  environment: PublicEnvironmentConfig,
): StorefrontRuntimeProfile {
  validateDeliveryConfiguration(brand, environment);

  return Object.freeze({
    capabilities: Object.freeze({ ...brand.capabilities }),
    environment,
  });
}

export function parseStorefrontRuntimeProfile(
  brand: BrandConfig,
  input: PublicEnvironmentInput,
): StorefrontRuntimeProfile {
  return createStorefrontRuntimeProfile(brand, parsePublicEnvironment(input));
}

export function readStorefrontRuntimeProfile(): StorefrontRuntimeProfile {
  return createStorefrontRuntimeProfile(brandConfig, readPublicEnvironment());
}
