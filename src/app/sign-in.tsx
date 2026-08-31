import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';

import { brandConfig } from '@/config/brand.config';
import {
  getCustomerAuthFailureMessage,
  getSignInRouteDestination,
} from '@/features/auth/customer-auth-route';
import {
  buildPhoneChallengeRequest,
  toSignInAuthPresentation,
} from '@/features/auth/customer-auth-presentation';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { useCustomerAuthState } from '@/features/auth/use-customer-auth-state';
import { getStorefrontRuntime } from '@/lib/storefront';

export default function SignInRoute() {
  const runtime = getStorefrontRuntime();
  const auth = runtime.services.customerAuth;
  const state = useCustomerAuthState(auth);
  const presentation = toSignInAuthPresentation(state);
  const [identifier, setIdentifier] = useState('');
  const restoreStarted = useRef(false);

  useEffect(() => {
    if (!restoreStarted.current && state.status === 'signed_out') {
      restoreStarted.current = true;
      void auth.restore();
    }
  }, [auth, state.status]);

  useEffect(() => {
    const destination = getSignInRouteDestination(state);
    if (destination) router.replace(destination as Href);
  }, [state]);

  return (
    <SignInScreen
      errorMessage={getCustomerAuthFailureMessage(presentation.failure)}
      identifier={identifier}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }}
      onIdentifierChange={setIdentifier}
      onOpenPrivacyPolicy={() => {
        void WebBrowser.openBrowserAsync(brandConfig.links.privacy);
      }}
      onOpenTerms={() => {
        void WebBrowser.openBrowserAsync(brandConfig.links.terms);
      }}
      onSubmit={(submission) => {
        const request = buildPhoneChallengeRequest(
          runtime.environment.merchantSlug,
          submission,
        );
        if (request) void auth.requestChallenge(request);
      }}
      pending={presentation.pending || state.status === 'restoring'}
    />
  );
}
