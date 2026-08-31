import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { LocationPermissionPresentation } from './address-entry.ts';
import {
  toAddressCandidate,
  toLocationPermissionPresentation,
  requiresForegroundPermissionForGeocoding,
  type AddressCandidateData,
} from './address-candidate-contract.ts';

export type NativeAddressGeocoderResult =
  | Readonly<{
      candidates: readonly AddressCandidateData[];
      kind: 'ready';
      permission: LocationPermissionPresentation;
    }>
  | Readonly<{
      kind: 'permission_denied';
      permission: 'denied';
    }>
  | Readonly<{
      kind: 'failed';
      permission: LocationPermissionPresentation;
    }>;

function permissionPresentation(
  permission: Location.LocationPermissionResponse,
): LocationPermissionPresentation {
  return toLocationPermissionPresentation(
    permission.status,
    permission.canAskAgain,
  );
}

async function requestGeocoderPermission(): Promise<
  Location.LocationPermissionResponse
> {
  const current = await Location.getForegroundPermissionsAsync();
  if (
    current.status === Location.PermissionStatus.GRANTED ||
    !current.canAskAgain
  ) {
    return current;
  }
  return Location.requestForegroundPermissionsAsync();
}

async function reverseCandidate(
  candidateId: string,
  coordinates: Readonly<{ latitude: number; longitude: number }>,
): Promise<AddressCandidateData | undefined> {
  const addresses = await Location.reverseGeocodeAsync(coordinates);
  const address = addresses[0];
  return address
    ? toAddressCandidate(candidateId, coordinates, address)
    : undefined;
}

export async function readAddressLocationPermission(): Promise<
  LocationPermissionPresentation
> {
  try {
    return permissionPresentation(
      await Location.getForegroundPermissionsAsync(),
    );
  } catch {
    return 'unavailable';
  }
}

export async function searchNativeAddressCandidates(
  query: string,
): Promise<NativeAddressGeocoderResult> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3 || normalizedQuery.length > 200) {
    return Object.freeze({ kind: 'failed', permission: 'unavailable' });
  }

  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return Object.freeze({ kind: 'failed', permission: 'unavailable' });
  }

  let permission: LocationPermissionPresentation;
  if (requiresForegroundPermissionForGeocoding(Platform.OS)) {
    let nativePermission: Location.LocationPermissionResponse;
    try {
      nativePermission = await requestGeocoderPermission();
    } catch {
      return Object.freeze({ kind: 'failed', permission: 'unavailable' });
    }
    if (nativePermission.status !== Location.PermissionStatus.GRANTED) {
      return Object.freeze({ kind: 'permission_denied', permission: 'denied' });
    }
    permission = 'granted';
  } else {
    permission = await readAddressLocationPermission();
  }

  try {
    const coordinates = (await Location.geocodeAsync(normalizedQuery)).slice(0, 5);
    const candidates: AddressCandidateData[] = [];
    for (const [index, coordinate] of coordinates.entries()) {
      const candidate = await reverseCandidate(
        `address-${index + 1}`,
        coordinate,
      );
      if (candidate) candidates.push(candidate);
    }

    return Object.freeze({
      candidates,
      kind: 'ready',
      permission,
    });
  } catch {
    return Object.freeze({ kind: 'failed', permission });
  }
}

export async function getCurrentNativeAddressCandidate(): Promise<
  NativeAddressGeocoderResult
> {
  let permission: Location.LocationPermissionResponse;
  try {
    permission = await requestGeocoderPermission();
  } catch {
    return Object.freeze({ kind: 'failed', permission: 'unavailable' });
  }
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    return Object.freeze({ kind: 'permission_denied', permission: 'denied' });
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const candidate = await reverseCandidate('current-location', position.coords);
    return candidate
      ? Object.freeze({
          candidates: [candidate],
          kind: 'ready',
          permission: 'granted',
        })
      : Object.freeze({ kind: 'failed', permission: 'granted' });
  } catch {
    return Object.freeze({ kind: 'failed', permission: 'granted' });
  }
}
