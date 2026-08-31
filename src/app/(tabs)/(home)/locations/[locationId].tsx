import { router, type Href, useLocalSearchParams } from 'expo-router';
import { Linking, Platform, Share } from 'react-native';
import { useEffect, useState } from 'react';

import { useMerchantLocationHeader } from '@/features/_shared';
import { getOptionalDeviceDistanceOrigin } from '@/features/locations/device-location-origin';
import {
  createLocationDirectoryService,
  type LocationDetailSnapshot,
} from '@/features/locations/location-directory-service';
import { StoreDetailRouteStateScreen } from '@/features/locations/StoreDetailRouteStateScreen';
import {
  createStoreDirectionsUrl,
  getStoreDetailFailureMessage,
  hasRestrictedNativeMapKey,
  isConfiguredOrderingLocation,
  loadStoreDetailProgressively,
} from '@/features/locations/store-detail-route';
import { StoreDetailScreen } from '@/features/locations/StoreDetailScreen';
import { StoreLocationMap } from '@/features/locations/StoreLocationMap';
import { getStorefrontRuntime } from '@/lib/storefront';

type DetailLoad = Readonly<{
  attempt: number;
  data?: LocationDetailSnapshot;
  errorMessage?: string;
}>;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/locations' as Href);
}

export default function StoreDetailRoute() {
  const runtime = getStorefrontRuntime();
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);
  const params = useLocalSearchParams<{ locationId?: string | string[] }>();
  const locationId =
    typeof params.locationId === 'string' ? params.locationId : '';
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<DetailLoad>();

  useEffect(() => {
    let active = true;
    const directory = createLocationDirectoryService(
      runtime.client,
      runtime.environment.merchantSlug,
    );

    void loadStoreDetailProgressively(
      directory,
      locationId,
      getOptionalDeviceDistanceOrigin,
      (result) => {
        if (!active) return;
        setLoad(
          result.kind === 'ready'
            ? { attempt, data: result.data }
            : {
                attempt,
                errorMessage: getStoreDetailFailureMessage(result.failure),
              },
        );
      },
    );

    return () => {
      active = false;
    };
  }, [attempt, locationId, runtime.client, runtime.environment.merchantSlug]);

  const currentLoad = load?.attempt === attempt ? load : undefined;
  if (!currentLoad?.data) {
    return (
      <StoreDetailRouteStateScreen
        errorMessage={currentLoad?.errorMessage}
        loading={!currentLoad}
        onBack={goBack}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  const { merchantLocation, presentation } = currentLoad.data;
  const coordinate =
    merchantLocation.lat !== null && merchantLocation.lng !== null
      ? { latitude: merchantLocation.lat, longitude: merchantLocation.lng }
      : undefined;
  const directionsUrl = coordinate
    ? createStoreDirectionsUrl(coordinate)
    : undefined;
  const hasMapKey = hasRestrictedNativeMapKey(
    Platform.OS,
    runtime.environment.maps,
  );
  const selectionDisabled = !isConfiguredOrderingLocation(
    merchantLocation.id,
    runtime.environment.locationId,
  );

  return (
    <StoreDetailScreen
      {...presentation}
      mapSlot={
        coordinate && hasMapKey ? (
          <StoreLocationMap
            latitude={coordinate.latitude}
            longitude={coordinate.longitude}
            name={presentation.name}
          />
        ) : undefined
      }
      merchantHeaderState={merchantHeader.state}
      onDirections={
        directionsUrl
          ? () => void Linking.openURL(directionsUrl).catch(() => undefined)
          : undefined
      }
      onSelectStore={() => router.replace('/menu' as Href)}
      onOpenAccount={() => router.push('/account' as Href)}
      onShare={() => {
        void Share.share({
          message: `${presentation.name}\n${presentation.address}`,
          title: presentation.name,
        }).catch(() => undefined);
      }}
      selectionDisabled={selectionDisabled}
    />
  );
}
