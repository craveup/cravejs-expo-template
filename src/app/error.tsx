import { type Href, useRouter } from 'expo-router';

import { SystemStatePresentation } from '@/features/system';

export default function ErrorRoute() {
  const router = useRouter();
  const canGoBack = router.canGoBack();

  function leaveError() {
    if (canGoBack) router.back();
    else router.replace('/' as Href);
  }

  return (
    <SystemStatePresentation
      backLabel={canGoBack ? 'back' : 'home'}
      onBack={leaveError}
      state={{ retryable: false, status: 'error' }}
    />
  );
}
