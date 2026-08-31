import { router, type Href, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';

import { brandConfig } from '@/config/brand.config';
import type { BrandConfig } from '@/config/brand.types';
import { useMerchantLocationHeader } from '@/features/_shared';
import {
  canLoadAccountSupplement,
  getAccountContentState,
  getAccountRouteDestination,
} from '@/features/account/account-home-route';
import {
  toAccountLoyaltyPresentation,
  toAccountProfilePresentation,
  toSavedStorePresentation,
} from '@/features/account/account-home-presentation';
import {
  AccountHomeScreen,
  type LoyaltyPresentation,
  type SavedStorePresentation,
} from '@/features/account/AccountHomeScreen';
import { useCustomerAuthState } from '@/features/auth/use-customer-auth-state';
import { createLocationDirectoryService } from '@/features/locations/location-directory-service';
import { getStorefrontRuntime } from '@/lib/storefront';

type AccountSupplement = Readonly<{
  customerId: string;
  loyalty?: LoyaltyPresentation;
  savedStore?: SavedStorePresentation;
}>;

export default function AccountRoute() {
  const runtime = getStorefrontRuntime();
  const runtimeBrand: BrandConfig = brandConfig;
  const auth = runtime.services.customerAuth;
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);
  const state = useCustomerAuthState(auth);
  const restoreStarted = useRef(false);
  const [sessionChecked, setSessionChecked] = useState(
    () => state.status !== 'signed_out',
  );
  const [supplement, setSupplement] = useState<AccountSupplement>();

  useEffect(() => {
    if (restoreStarted.current || auth.getState().status !== 'signed_out') return;
    restoreStarted.current = true;
    let active = true;
    void auth.restore().finally(() => {
      if (active) setSessionChecked(true);
    });

    return () => {
      active = false;
    };
  }, [auth]);

  useEffect(() => {
    const destination = getAccountRouteDestination(state, sessionChecked);
    if (destination) router.replace(destination as Href);
  }, [sessionChecked, state]);

  useFocusEffect(
    useCallback(() => {
      if (!canLoadAccountSupplement(state) || state.status !== 'authenticated') {
        return;
      }

      let active = true;
      const customerId = state.profile.id;
      const locations = createLocationDirectoryService(
        runtime.client,
        runtime.environment.merchantSlug,
      );

      void Promise.all([
        locations.get(runtime.environment.locationId),
        runtimeBrand.capabilities.loyalty === 'enabled'
          ? runtime.services.loyalty.getLedger()
          : Promise.resolve(undefined),
      ])
        .then(([locationResult, loyaltyResult]) => {
          if (!active) return;

          const savedStore =
            locationResult.kind === 'ready'
              ? toSavedStorePresentation(locationResult.data.merchantLocation)
              : undefined;
          const loyalty =
            loyaltyResult?.kind === 'ready'
              ? toAccountLoyaltyPresentation(loyaltyResult.data)
              : undefined;

          setSupplement({
            customerId,
            ...(loyalty ? { loyalty } : {}),
            ...(savedStore ? { savedStore } : {}),
          });
        })
        .catch(() => {
          if (active) setSupplement({ customerId });
        });

      return () => {
        active = false;
      };
    }, [runtime, runtimeBrand.capabilities.loyalty, state]),
  );

  const content = getAccountContentState(state);
  const screen =
    content.status === 'error' ? (
      <AccountHomeScreen
        error
        merchantHeaderState={merchantHeader.state}
        onMerchantHeaderRetry={merchantHeader.retry}
        onRetry={() => void auth.retryProfile()}
      />
    ) : content.status === 'loading' ? (
      <AccountHomeScreen
        loading
        merchantHeaderState={merchantHeader.state}
        onMerchantHeaderRetry={merchantHeader.retry}
      />
    ) : (
      <AccountHomeScreen
        loyalty={
          supplement?.customerId === content.profile.id
            ? supplement.loyalty
            : undefined
        }
        merchantHeaderState={merchantHeader.state}
        onHelp={() => {
          void WebBrowser.openBrowserAsync(brandConfig.links.support);
        }}
        onLogout={() => {
          void auth.logout().then(() => router.replace('/sign-in' as Href));
        }}
        onMerchantHeaderRetry={merchantHeader.retry}
        onOrderHistory={() => router.push('/orders' as Href)}
        onSavedStores={() => router.push('/locations' as Href)}
        profile={toAccountProfilePresentation(content.profile)}
        savedStore={
          supplement?.customerId === content.profile.id
            ? supplement.savedStore
            : undefined
        }
      />
    );

  return (
    <>
      <StatusBar style="dark" />
      {screen}
    </>
  );
}
