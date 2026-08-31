import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  getOtpAuthFailureMessage,
  getOtpRouteDestination,
} from '@/features/auth/customer-auth-route';
import { toOtpAuthPresentation } from '@/features/auth/customer-auth-presentation';
import { OtpScreen } from '@/features/auth/OtpScreen';
import { useCustomerAuthState } from '@/features/auth/use-customer-auth-state';
import { getStorefrontRuntime } from '@/lib/storefront';

export default function VerifySignInRoute() {
  const auth = getStorefrontRuntime().services.customerAuth;
  const state = useCustomerAuthState(auth);
  const presentation = toOtpAuthPresentation(state);
  const [hideFailure, setHideFailure] = useState(false);

  useEffect(() => {
    const destination = getOtpRouteDestination(state);
    if (destination) router.replace(destination as Href);
  }, [state]);

  if (!presentation) return null;

  return (
    <OtpScreen
      errorMessage={
        hideFailure
          ? undefined
          : getOtpAuthFailureMessage(presentation.failure)
      }
      identifierLabel={presentation.identifierLabel}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/sign-in' as Href);
      }}
      onCodeChange={() => setHideFailure(true)}
      onResend={() => {
        setHideFailure(false);
        void auth.resend();
      }}
      onSubmit={(code) => {
        setHideFailure(false);
        void auth.verify(code);
      }}
      pending={presentation.pending}
      resendAvailable={presentation.resendAvailable}
    />
  );
}
