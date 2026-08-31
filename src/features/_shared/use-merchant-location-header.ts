import { useCallback, useEffect, useState } from 'react';

import type { StorefrontBootstrapService } from '../../lib/storefront-bootstrap-service.ts';
import {
  toMerchantLocationHeaderState,
  type MerchantLocationHeaderState,
} from './merchant-location-header.ts';

export type MerchantLocationHeaderController = Readonly<{
  retry: () => void;
  state: MerchantLocationHeaderState;
}>;

export function useMerchantLocationHeader(
  service: StorefrontBootstrapService,
): MerchantLocationHeaderController {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MerchantLocationHeaderState>({
    status: 'loading',
  });

  useEffect(() => {
    let active = true;

    void service
      .loadShell()
      .then((result) => {
        if (!active) return;
        setState(
          result.kind === 'ready'
            ? toMerchantLocationHeaderState(result.data)
            : { status: 'unavailable' },
        );
      })
      .catch(() => {
        if (active) setState({ status: 'unavailable' });
      });

    return () => {
      active = false;
    };
  }, [attempt, service]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);
  return { retry, state };
}
