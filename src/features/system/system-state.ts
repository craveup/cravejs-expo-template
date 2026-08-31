export type SystemStateViewState =
  | Readonly<{
      checking: boolean;
      status: 'offline';
    }>
  | Readonly<{
      requestId?: string;
      retryable: boolean;
      status: 'error';
    }>;

export type SystemNetworkState = Readonly<{
  isConnected?: boolean;
  isInternetReachable?: boolean;
}>;

export function isSystemNetworkReachable(
  networkState: SystemNetworkState,
): boolean {
  return (
    networkState.isConnected === true &&
    networkState.isInternetReachable === true
  );
}

export function canResumeFromOffline(
  refreshedState: SystemNetworkState,
): boolean {
  return isSystemNetworkReachable(refreshedState);
}
