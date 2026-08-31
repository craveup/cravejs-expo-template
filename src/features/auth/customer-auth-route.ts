import type { CustomerAuthPresentationFailure } from './customer-auth-presentation.ts';
import type { CustomerAuthState } from './customer-auth-state.ts';

export type CustomerAuthRouteDestination = '/account' | '/sign-in/verify';
export type OtpRouteDestination = '/account' | '/sign-in';

const FAILURE_MESSAGES = {
  invalid: 'Check your phone number and try again.',
  network: 'We could not reach the sign-in service. Try again.',
  rate_limited: 'Too many attempts. Please wait and try again.',
  session: 'Your session ended. Sign in again.',
  unknown: 'We could not send a code. Try again.',
} as const satisfies Record<CustomerAuthPresentationFailure, string>;

export function getCustomerAuthFailureMessage(
  failure?: CustomerAuthPresentationFailure,
): string | undefined {
  return failure ? FAILURE_MESSAGES[failure] : undefined;
}

export function getSignInRouteDestination(
  state: CustomerAuthState,
): CustomerAuthRouteDestination | undefined {
  if (
    state.status === 'authenticated' ||
    state.status === 'profile_unavailable'
  ) {
    return '/account';
  }
  if (
    state.status === 'awaiting_verification' ||
    state.status === 'verifying' ||
    (state.status === 'requesting_challenge' && state.previousChallenge)
  ) {
    return '/sign-in/verify';
  }

  return undefined;
}

export function getOtpRouteDestination(
  state: CustomerAuthState,
): OtpRouteDestination | undefined {
  if (state.status === 'authenticated' || state.status === 'profile_unavailable') {
    return '/account';
  }
  if (
    state.status === 'signed_out' ||
    state.status === 'restoring' ||
    (state.status === 'requesting_challenge' && !state.previousChallenge)
  ) {
    return '/sign-in';
  }

  return undefined;
}

export function getOtpAuthFailureMessage(
  failure?: CustomerAuthPresentationFailure,
): string | undefined {
  if (!failure) return undefined;
  if (failure === 'invalid') return 'Check the code and try again.';
  if (failure === 'rate_limited') {
    return 'Too many attempts. Please wait and try again.';
  }
  if (failure === 'network') {
    return 'We could not verify the code. Check your connection and try again.';
  }
  if (failure === 'session') return 'Your sign-in code expired. Request a new one.';
  return 'We could not verify the code. Try again.';
}
