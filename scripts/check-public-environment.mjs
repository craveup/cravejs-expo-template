import { PublicEnvironmentConfigError } from '../src/config/public-env.ts';
import {
  readStorefrontRuntimeProfile,
  StorefrontRuntimeProfileError,
} from '../src/config/storefront-runtime-profile.ts';

try {
  const profile = readStorefrontRuntimeProfile();
  process.stdout.write(
    `${JSON.stringify({
      apiOrigin: profile.environment.apiOrigin,
      capabilities: profile.capabilities,
      checkoutOrigin: profile.environment.checkoutOrigin,
      locationConfigured: true,
      maps: {
        android: Boolean(profile.environment.maps.androidApiKey),
        ios: Boolean(profile.environment.maps.iosApiKey),
      },
      merchantSlug: profile.environment.merchantSlug,
    })}\n`,
  );
} catch (error) {
  console.error(
    error instanceof PublicEnvironmentConfigError ||
      error instanceof StorefrontRuntimeProfileError
      ? error.message
      : 'Public environment validation failed.',
  );
  process.exitCode = 1;
}
