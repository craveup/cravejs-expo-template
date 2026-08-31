import { useSyncExternalStore } from 'react';

import type { CustomerAuthService } from './customer-auth-service.ts';

export function useCustomerAuthState(service: CustomerAuthService) {
  return useSyncExternalStore(
    service.subscribe,
    service.getState,
    service.getState,
  );
}
