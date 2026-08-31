import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useMerchantLocationHeader } from '@/features/_shared';
import { DeliveryAddressScreen } from '@/features/delivery/DeliveryAddressScreen';
import type { LocationPermissionPresentation } from '@/features/delivery/address-entry';
import { getAddressGeocoderErrorMessage } from '@/features/delivery/address-route';
import type { AddressCandidateData } from '@/features/delivery/address-candidate-contract';
import {
  getCurrentNativeAddressCandidate,
  readAddressLocationPermission,
  searchNativeAddressCandidates,
} from '@/features/delivery/native-address-geocoder';
import { getStorefrontRuntime } from '@/lib/storefront';

type AddressSearchState = Readonly<{
  candidates: readonly AddressCandidateData[];
  errorMessage?: string;
  loading: boolean;
  usingCurrentLocation: boolean;
}>;

const INITIAL_SEARCH_STATE: AddressSearchState = Object.freeze({
  candidates: [],
  loading: false,
  usingCurrentLocation: false,
});

function EnabledDeliveryAddressRoute() {
  const runtime = getStorefrontRuntime();
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);
  const operationVersion = useRef(0);
  const lastOperation = useRef<'current' | 'search'>('search');
  const [query, setQuery] = useState('');
  const [permission, setPermission] =
    useState<LocationPermissionPresentation>();
  const [selectedCandidate, setSelectedCandidate] =
    useState<AddressCandidateData>();
  const [searchState, setSearchState] =
    useState<AddressSearchState>(INITIAL_SEARCH_STATE);

  useEffect(() => {
    let active = true;
    void readAddressLocationPermission().then((nextPermission) => {
      if (active) setPermission(nextPermission);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      operationVersion.current += 1;
    },
    [],
  );

  const applySearch = async () => {
    lastOperation.current = 'search';
    const version = ++operationVersion.current;
    setSearchState({
      candidates: [],
      loading: true,
      usingCurrentLocation: false,
    });
    const result = await searchNativeAddressCandidates(query);
    if (version !== operationVersion.current) return;
    setPermission(result.permission);
    setSearchState({
      candidates: result.kind === 'ready' ? result.candidates : [],
      errorMessage: getAddressGeocoderErrorMessage(result),
      loading: false,
      usingCurrentLocation: false,
    });
  };

  const applyCurrentLocation = async () => {
    lastOperation.current = 'current';
    const version = ++operationVersion.current;
    setSearchState({
      candidates: [],
      loading: false,
      usingCurrentLocation: true,
    });
    const result = await getCurrentNativeAddressCandidate();
    if (version !== operationVersion.current) return;
    setPermission(result.permission);

    const candidate = result.kind === 'ready' ? result.candidates[0] : undefined;
    if (candidate) {
      setQuery(candidate.customerAddressInput.fullAddress);
      setSelectedCandidate(candidate);
    }
    setSearchState({
      candidates: result.kind === 'ready' ? result.candidates : [],
      errorMessage: getAddressGeocoderErrorMessage(result),
      loading: false,
      usingCurrentLocation: false,
    });
  };

  return (
    <DeliveryAddressScreen
      candidates={searchState.candidates}
      errorMessage={searchState.errorMessage}
      loading={searchState.loading}
      locationPermissionState={permission}
      merchantHeaderState={merchantHeader.state}
      onOpenAccount={() => router.push('/account')}
      onQueryChange={(value) => {
        ++operationVersion.current;
        setQuery(value);
        setSelectedCandidate(undefined);
        setSearchState(INITIAL_SEARCH_STATE);
      }}
      onRetry={() => {
        if (lastOperation.current === 'current') void applyCurrentLocation();
        else void applySearch();
      }}
      onSelectCandidate={(candidate) => {
        setSelectedCandidate(
          searchState.candidates.find(({ id }) => id === candidate.id),
        );
      }}
      onSubmitQuery={() => void applySearch()}
      onUseCurrentLocation={() => void applyCurrentLocation()}
      query={query}
      selectedCandidateId={selectedCandidate?.id}
      usingCurrentLocation={searchState.usingCurrentLocation}
    />
  );
}

export default function DeliveryAddressRoute() {
  return <EnabledDeliveryAddressRoute />;
}
