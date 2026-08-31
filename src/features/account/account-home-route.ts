import type { CustomerAuthState } from '../auth/customer-auth-state.ts';

export type AccountRouteDestination = '/sign-in' | '/sign-in/verify';
export type AccountContentState =
  | Readonly<{ status: 'error' }>
  | Readonly<{ status: 'loading' }>
  | Readonly<{
      profile: Extract<CustomerAuthState, { status: 'authenticated' }>['profile'];
      status: 'ready';
    }>;

export function getAccountContentState(
  state: CustomerAuthState,
): AccountContentState {
  if (state.status === 'authenticated') {
    return { profile: state.profile, status: 'ready' };
  }
  if (state.status === 'profile_unavailable') return { status: 'error' };
  return { status: 'loading' };
}

export function getAccountRouteDestination(
  state: CustomerAuthState,
  sessionChecked: boolean,
): AccountRouteDestination | undefined {
  if (!sessionChecked || state.status === 'restoring') return undefined;
  if (state.status === 'signed_out' || state.status === 'requesting_challenge') {
    return state.status === 'requesting_challenge' && state.previousChallenge
      ? '/sign-in/verify'
      : '/sign-in';
  }
  if (state.status === 'awaiting_verification' || state.status === 'verifying') {
    return '/sign-in/verify';
  }

  return undefined;
}

export function canLoadAccountSupplement(state: CustomerAuthState): boolean {
  return state.status === 'authenticated';
}
