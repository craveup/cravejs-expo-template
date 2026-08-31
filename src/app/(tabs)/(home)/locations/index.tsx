import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { useMerchantLocationHeader } from '@/features/_shared';
import { getOptionalDeviceDistanceOrigin } from '@/features/locations/device-location-origin';
import {
  createLocationDirectoryService,
  type LocationDirectorySnapshot,
} from '@/features/locations/location-directory-service';
import {
  getLocationDirectoryRouteState,
  getLocationDirectoryFailureMessage,
  loadLocationDirectoryProgressively,
} from '@/features/locations/location-picker-route';
import { LocationPickerScreen } from '@/features/locations/LocationPickerScreen';
import { NoNearbyStoresScreen } from '@/features/locations/NoNearbyStoresScreen';
import { getStorefrontRuntime } from '@/lib/storefront';

type DirectoryLoad = Readonly<{
  attempt: number;
  data?: LocationDirectorySnapshot;
  errorMessage?: string;
}>;

export default function PickupLocationsRoute() {
  const runtime = getStorefrontRuntime();
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);
  const [query, setQuery] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState(
    runtime.environment.locationId,
  );
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<DirectoryLoad>();

  useEffect(() => {
    let active = true;
    const directory = createLocationDirectoryService(
      runtime.client,
      runtime.environment.merchantSlug,
    );

    void loadLocationDirectoryProgressively(
      directory,
      getOptionalDeviceDistanceOrigin,
      (result) => {
        if (!active) return;
        setLoad(
          result.kind === 'ready'
            ? { attempt, data: result.data }
            : {
                attempt,
                errorMessage: getLocationDirectoryFailureMessage(result.failure),
              },
        );
      },
    );

    return () => {
      active = false;
    };
  }, [attempt, runtime.client, runtime.environment.merchantSlug]);

  const currentLoad = load?.attempt === attempt ? load : undefined;
  const routeState = getLocationDirectoryRouteState(currentLoad);

  if (routeState === 'no-published-locations') {
    return (
      <NoNearbyStoresScreen
        onBrowseMenu={() => router.replace('/menu' as Href)}
      />
    );
  }

  return (
    <LocationPickerScreen
      errorMessage={currentLoad?.errorMessage}
      loading={!currentLoad}
      locations={currentLoad?.data?.items ?? []}
      merchantHeaderState={merchantHeader.state}
      onOpenAccount={() => router.push('/account' as Href)}
      onQueryChange={setQuery}
      onRetry={() => {
        merchantHeader.retry();
        setAttempt((value) => value + 1);
      }}
      onSelect={(location) => {
        setSelectedLocationId(location.id);
        router.push(
          `/locations/${encodeURIComponent(location.id)}` as Href,
        );
      }}
      query={query}
      selectedLocationId={selectedLocationId}
    />
  );
}
