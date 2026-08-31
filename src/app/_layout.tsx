import { Stack, usePathname, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { BagProvider } from '@/features/bag';
import {
  CatalogBrowseProvider,
  isCatalogBrowsePath,
} from '@/features/catalog';
import { getStorefrontRuntime } from '@/lib/storefront';
import { colors, useAppFonts } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function createBootstrapService() {
  return getStorefrontRuntime().services.bootstrap;
}

function createBagDependencies() {
  const runtime = getStorefrontRuntime();
  return {
    bootstrap: runtime.services.bootstrap,
    cart: runtime.services.cart,
    cartSessions: runtime.cartSessions,
    checkoutRecovery: runtime.services.checkoutRecovery,
    locationId: runtime.environment.locationId,
    ...(runtime.capabilities.loyalty === 'enabled'
      ? { loyalty: runtime.services.loyalty }
      : {}),
  };
}

function getCatalogScopeKey(): string {
  try {
    const { environment } = getStorefrontRuntime();
    return [
      environment.environmentNamespace,
      environment.merchantSlug,
      environment.locationId,
    ].join('.');
  } catch {
    return 'catalog-unavailable';
  }
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const pathname = usePathname();
  const segments = useSegments();
  const catalogActive =
    pathname === '/search' ||
    (segments[0] === '(tabs)' && isCatalogBrowsePath(pathname));

  const bagActive =
    pathname === '/bag' ||
    pathname === '/bag-clear' ||
    pathname === '/bag-remove-item' ||
    pathname === '/checkout';

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <BagProvider
      active={bagActive}
      createDependencies={createBagDependencies}
      key={getCatalogScopeKey()}
    >
      <CatalogBrowseProvider
        active={catalogActive}
        createBootstrapService={createBootstrapService}
      >
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.canvas },
            headerShown: false,
          }}
        >
          <Stack.Screen name="error" />
          <Stack.Screen name="offline" />
          <Stack.Screen name="store-closed" />
          <Stack.Screen name="checkout" />
        </Stack>
      </CatalogBrowseProvider>
    </BagProvider>
  );
}
