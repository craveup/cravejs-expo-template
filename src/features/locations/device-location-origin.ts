import type { DistanceRequest } from '@craveup/storefront-sdk';
import * as Location from 'expo-location';

import { toDistanceOrigin } from './device-location-origin-contract.ts';

export async function getOptionalDeviceDistanceOrigin(): Promise<
  DistanceRequest | undefined
> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      if (!permission.canAskAgain) return undefined;
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (permission.status !== Location.PermissionStatus.GRANTED) return undefined;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return toDistanceOrigin(position.coords);
  } catch {
    return undefined;
  }
}
