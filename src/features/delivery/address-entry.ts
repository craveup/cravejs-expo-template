export type AddressCandidatePresentation = {
  id: string;
  primaryLabel: string;
  secondaryLabel?: string;
};

export type AddressEntryState = 'idle' | 'loading' | 'error' | 'empty' | 'results';

export type LocationPermissionPresentation = 'granted' | 'prompt' | 'denied' | 'unavailable';
export type CurrentLocationActionState = 'hidden' | 'enabled' | 'disabled';

export function getAddressEntryState(
  query: string,
  candidateCount: number,
  loading: boolean,
  errorMessage?: string,
): AddressEntryState {
  if (loading) return 'loading';
  if (errorMessage) return 'error';
  if (!query.trim()) return 'idle';
  if (candidateCount === 0) return 'empty';
  return 'results';
}

export function getCurrentLocationActionState(
  callbackAvailable: boolean,
  permissionState?: LocationPermissionPresentation,
): CurrentLocationActionState {
  if (!callbackAvailable || !permissionState) return 'hidden';
  return permissionState === 'granted' || permissionState === 'prompt' ? 'enabled' : 'disabled';
}

export function selectAddressCandidate(
  candidates: readonly AddressCandidatePresentation[],
  candidateId: string,
): AddressCandidatePresentation | undefined {
  return candidates.find((candidate) => candidate.id === candidateId);
}
