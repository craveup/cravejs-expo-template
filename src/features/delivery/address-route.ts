import type { NativeAddressGeocoderResult } from './native-address-geocoder.ts';

export function getAddressGeocoderErrorMessage(
  result: NativeAddressGeocoderResult,
): string | undefined {
  if (result.kind === 'ready') return undefined;
  if (result.kind === 'permission_denied') {
    return 'Location permission is needed to find address candidates.';
  }
  return 'We could not find address candidates. Try a more specific search.';
}
