import * as Network from 'expo-network';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import {
  canResumeFromOffline,
  SystemStatePresentation,
} from '@/features/system';

export default function OfflineRoute() {
  const router = useRouter();
  const checkingRef = useRef(false);
  const [checking, setChecking] = useState(false);

  const retry = useCallback(async () => {
    if (checkingRef.current) return;

    checkingRef.current = true;
    setChecking(true);

    try {
      const refreshedNetworkState = await Network.getNetworkStateAsync();
      if (!canResumeFromOffline(refreshedNetworkState)) {
        return;
      }

      if (router.canGoBack()) router.back();
      else router.replace('/' as Href);
    } catch {
      // The offline state remains authoritative when the connectivity probe fails.
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [router]);

  return (
    <SystemStatePresentation
      onRetry={() => void retry()}
      state={{ checking, status: 'offline' }}
    />
  );
}
