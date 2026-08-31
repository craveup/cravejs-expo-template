import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import {
  createCustomerAuthChallenge,
  createCustomerLoginRequest,
  validateStorefrontCustomer,
  type CustomerAuthChallenge,
  type CustomerLoginContractRequest,
  type StorefrontCustomerContract,
} from './customer-auth-contract.ts';

export type CustomerAuthState =
  | Readonly<{ failure?: StorefrontFailure; status: 'signed_out' }>
  | Readonly<{
      previousChallenge?: CustomerAuthChallenge;
      request: CustomerLoginContractRequest;
      status: 'requesting_challenge';
    }>
  | Readonly<{
      challenge: CustomerAuthChallenge;
      failure?: StorefrontFailure;
      status: 'awaiting_verification';
    }>
  | Readonly<{
      challenge: CustomerAuthChallenge;
      status: 'verifying';
    }>
  | Readonly<{ status: 'restoring' }>
  | Readonly<{
      failure: StorefrontFailure;
      status: 'profile_unavailable';
    }>
  | Readonly<{
      profile: StorefrontCustomerContract;
      status: 'authenticated';
    }>;

export type CustomerAuthEvent =
  | Readonly<{
      request: CustomerLoginContractRequest;
      type: 'challenge_requested';
    }>
  | Readonly<{ response: unknown; type: 'challenge_received' }>
  | Readonly<{ failure: StorefrontFailure; type: 'challenge_failed' }>
  | Readonly<{ type: 'verification_requested' }>
  | Readonly<{ failure: StorefrontFailure; type: 'verification_failed' }>
  | Readonly<{ type: 'restore_requested' }>
  | Readonly<{ failure: StorefrontFailure; type: 'restore_failed' }>
  | Readonly<{ type: 'restore_empty' }>
  | Readonly<{ failure: StorefrontFailure; type: 'profile_failed' }>
  | Readonly<{ profile: unknown; type: 'authenticated' }>
  | Readonly<{ failure: StorefrontFailure; type: 'session_failed' }>
  | Readonly<{ type: 'signed_out' }>;

export class CustomerAuthTransitionError extends Error {
  constructor() {
    super('Invalid customer authentication state transition.');
    this.name = 'CustomerAuthTransitionError';
  }
}

export const INITIAL_CUSTOMER_AUTH_STATE: CustomerAuthState = Object.freeze({
  status: 'signed_out',
});

function invalidTransition(): never {
  throw new CustomerAuthTransitionError();
}

export function reduceCustomerAuthState(
  state: CustomerAuthState,
  event: CustomerAuthEvent,
): CustomerAuthState {
  switch (event.type) {
    case 'challenge_requested': {
      if (state.status !== 'signed_out' && state.status !== 'awaiting_verification') {
        return invalidTransition();
      }

      const request = createCustomerLoginRequest(
        event.request.merchantSlug,
        event.request.identifierString,
      );

      if (!request.ok) return invalidTransition();

      return Object.freeze({
        ...(state.status === 'awaiting_verification'
          ? { previousChallenge: state.challenge }
          : {}),
        request: request.value,
        status: 'requesting_challenge',
      });
    }
    case 'challenge_received': {
      if (state.status !== 'requesting_challenge') return invalidTransition();

      const challenge = createCustomerAuthChallenge(state.request, event.response);

      if (!challenge.ok) return invalidTransition();

      return Object.freeze({
        challenge: challenge.value,
        status: 'awaiting_verification',
      });
    }
    case 'challenge_failed': {
      if (state.status !== 'requesting_challenge') return invalidTransition();

      return state.previousChallenge
        ? Object.freeze({
            challenge: state.previousChallenge,
            failure: event.failure,
            status: 'awaiting_verification',
          })
        : Object.freeze({ failure: event.failure, status: 'signed_out' });
    }
    case 'verification_requested': {
      if (state.status !== 'awaiting_verification') return invalidTransition();
      return Object.freeze({
        challenge: state.challenge,
        status: 'verifying',
      });
    }
    case 'verification_failed': {
      if (state.status !== 'verifying') return invalidTransition();
      return Object.freeze({
        challenge: state.challenge,
        failure: event.failure,
        status: 'awaiting_verification',
      });
    }
    case 'restore_requested': {
      if (state.status !== 'signed_out' && state.status !== 'profile_unavailable') {
        return invalidTransition();
      }
      return Object.freeze({ status: 'restoring' });
    }
    case 'restore_failed': {
      if (state.status !== 'restoring') return invalidTransition();
      return Object.freeze({ failure: event.failure, status: 'signed_out' });
    }
    case 'restore_empty': {
      if (state.status !== 'restoring') return invalidTransition();
      return INITIAL_CUSTOMER_AUTH_STATE;
    }
    case 'profile_failed': {
      if (state.status !== 'verifying' && state.status !== 'restoring') {
        return invalidTransition();
      }
      return Object.freeze({
        failure: event.failure,
        status: 'profile_unavailable',
      });
    }
    case 'authenticated': {
      if (state.status !== 'verifying' && state.status !== 'restoring') {
        return invalidTransition();
      }

      const profile = validateStorefrontCustomer(event.profile);

      if (!profile.ok) return invalidTransition();

      return Object.freeze({
        profile: profile.value,
        status: 'authenticated',
      });
    }
    case 'session_failed':
      return Object.freeze({ failure: event.failure, status: 'signed_out' });
    case 'signed_out':
      return INITIAL_CUSTOMER_AUTH_STATE;
  }
}
