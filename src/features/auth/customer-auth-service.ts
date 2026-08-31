import type { CustomerSessionStore } from '../../lib/customer-session.ts';
import {
  isCustomerAuthenticationFailure,
  SECURE_STORAGE_FAILURE,
  type CustomerAuthenticationFailure,
} from '../../lib/customer-request-failure.ts';
import { mapStorefrontError, type StorefrontFailure } from '../../lib/storefront-errors.ts';
import type { StorefrontClient } from '../../lib/storefront.ts';
import {
  buildCustomerVerificationRequest,
  createCustomerAuthChallenge,
  createCustomerLoginRequest,
  validateCustomerVerificationResponse,
  validateStorefrontCustomer,
  type CustomerLoginContractRequest,
} from './customer-auth-contract.ts';
import {
  INITIAL_CUSTOMER_AUTH_STATE,
  reduceCustomerAuthState,
  type CustomerAuthEvent,
  type CustomerAuthState,
} from './customer-auth-state.ts';

export type CustomerAuthClient = Pick<
  StorefrontClient['customer'],
  'getProfile' | 'login' | 'logout' | 'verifyOtp'
>;

export type CustomerAuthActionResult =
  | Readonly<{ ok: true; state: CustomerAuthState }>
  | Readonly<{
      failure: StorefrontFailure;
      ok: false;
      state: CustomerAuthState;
    }>;

export interface CustomerAuthService {
  getState(): CustomerAuthState;
  invalidateSession(
    failure: CustomerAuthenticationFailure,
  ): Promise<StorefrontFailure>;
  logout(): Promise<CustomerAuthActionResult>;
  requestChallenge(
    request: CustomerLoginContractRequest,
  ): Promise<CustomerAuthActionResult>;
  resend(): Promise<CustomerAuthActionResult>;
  restore(): Promise<CustomerAuthActionResult>;
  retryProfile(): Promise<CustomerAuthActionResult>;
  subscribe(listener: (state: CustomerAuthState) => void): () => void;
  verify(
    otp: string,
    names?: Readonly<{ customerName?: string; lastName?: string }>,
  ): Promise<CustomerAuthActionResult>;
}

const INVALID_INPUT_FAILURE: StorefrontFailure = Object.freeze({
  code: 'CLIENT_VALIDATION_ERROR',
  kind: 'invalid_request',
  retryable: false,
});

const INVALID_RESPONSE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'INVALID_STOREFRONT_RESPONSE',
  kind: 'unavailable',
  retryable: true,
});

function succeeded(state: CustomerAuthState): CustomerAuthActionResult {
  return Object.freeze({ ok: true, state });
}

function failed(
  state: CustomerAuthState,
  failure: StorefrontFailure,
): CustomerAuthActionResult {
  return Object.freeze({ failure, ok: false, state });
}

export function createCustomerAuthService(
  client: CustomerAuthClient,
  sessions: CustomerSessionStore,
): CustomerAuthService {
  let state = INITIAL_CUSTOMER_AUTH_STATE;
  let operationVersion = 0;
  const listeners = new Set<(nextState: CustomerAuthState) => void>();

  function transition(event: CustomerAuthEvent): CustomerAuthState {
    state = reduceCustomerAuthState(state, event);
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        // A presentation subscriber cannot corrupt authentication progress.
      }
    }
    return state;
  }

  async function clearSession(): Promise<StorefrontFailure | undefined> {
    try {
      await sessions.clear();
      return undefined;
    } catch {
      return SECURE_STORAGE_FAILURE;
    }
  }

  async function invalidateSession(
    failure: CustomerAuthenticationFailure,
  ): Promise<StorefrontFailure> {
    ++operationVersion;
    const clearFailure = await clearSession();
    const terminalFailure = clearFailure ?? failure;
    transition({ failure: terminalFailure, type: 'session_failed' });
    return terminalFailure;
  }

  async function loadProfile(version: number): Promise<CustomerAuthActionResult> {
    try {
      const response = await client.getProfile();
      if (version !== operationVersion) {
        return failed(state, INVALID_INPUT_FAILURE);
      }
      const profile = validateStorefrontCustomer(response);

      if (!profile.ok) {
        return failed(
          transition({
            failure: INVALID_RESPONSE_FAILURE,
            type: 'profile_failed',
          }),
          INVALID_RESPONSE_FAILURE,
        );
      }

      const nextState = transition({
        profile: profile.value,
        type: 'authenticated',
      });
      return succeeded(nextState);
    } catch (error) {
      if (version !== operationVersion) {
        return failed(state, INVALID_INPUT_FAILURE);
      }
      const failure = mapStorefrontError(error);

      if (isCustomerAuthenticationFailure(failure)) {
        const terminalFailure = await invalidateSession(failure);
        return failed(state, terminalFailure);
      }

      return failed(
        transition({ failure, type: 'profile_failed' }),
        failure,
      );
    }
  }

  async function requestChallenge(
    request: CustomerLoginContractRequest,
  ): Promise<CustomerAuthActionResult> {
    const validated = createCustomerLoginRequest(
      request.merchantSlug,
      request.identifierString,
    );

    if (!validated.ok) return failed(state, INVALID_INPUT_FAILURE);
    try {
      transition({ request: validated.value, type: 'challenge_requested' });
    } catch {
      return failed(state, INVALID_INPUT_FAILURE);
    }
    const version = ++operationVersion;

    try {
      const response = await client.login(validated.value);
      if (version !== operationVersion) {
        return failed(state, INVALID_INPUT_FAILURE);
      }

      if (!createCustomerAuthChallenge(validated.value, response).ok) {
        return failed(
          transition({
            failure: INVALID_RESPONSE_FAILURE,
            type: 'challenge_failed',
          }),
          INVALID_RESPONSE_FAILURE,
        );
      }

      return succeeded(transition({ response, type: 'challenge_received' }));
    } catch (error) {
      if (version !== operationVersion) {
        return failed(state, INVALID_INPUT_FAILURE);
      }
      const failure = mapStorefrontError(error);
      return failed(
        transition({ failure, type: 'challenge_failed' }),
        failure,
      );
    }
  }

  async function restore(): Promise<CustomerAuthActionResult> {
    try {
      transition({ type: 'restore_requested' });
    } catch {
      return failed(state, INVALID_INPUT_FAILURE);
    }
    const version = ++operationVersion;

    let token: string | null;

    try {
      token = await sessions.getAuthToken();
    } catch {
      if (version !== operationVersion) {
        return failed(state, INVALID_INPUT_FAILURE);
      }
      return failed(
        transition({ failure: SECURE_STORAGE_FAILURE, type: 'restore_failed' }),
        SECURE_STORAGE_FAILURE,
      );
    }

    if (version !== operationVersion) {
      return failed(state, INVALID_INPUT_FAILURE);
    }

    if (!token) return succeeded(transition({ type: 'restore_empty' }));
    return loadProfile(version);
  }

  return Object.freeze({
    getState(): CustomerAuthState {
      return state;
    },
    invalidateSession,
    async logout(): Promise<CustomerAuthActionResult> {
      ++operationVersion;
      let failure: StorefrontFailure | undefined;

      try {
        const token = await sessions.getAuthToken();
        if (token) await client.logout();
      } catch (error) {
        failure = mapStorefrontError(error);
      }

      const clearFailure = await clearSession();
      failure = clearFailure ?? failure;

      if (failure) {
        return failed(
          transition({ failure, type: 'session_failed' }),
          failure,
        );
      }

      return succeeded(transition({ type: 'signed_out' }));
    },
    requestChallenge,
    async resend(): Promise<CustomerAuthActionResult> {
      if (state.status !== 'awaiting_verification') {
        return failed(state, INVALID_INPUT_FAILURE);
      }

      return requestChallenge({
        identifierString: state.challenge.identifierString,
        merchantSlug: state.challenge.merchantSlug,
      });
    },
    restore,
    async retryProfile(): Promise<CustomerAuthActionResult> {
      if (state.status !== 'profile_unavailable') {
        return failed(state, INVALID_INPUT_FAILURE);
      }
      return restore();
    },
    subscribe(listener: (nextState: CustomerAuthState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async verify(
      otp: string,
      names: Readonly<{ customerName?: string; lastName?: string }> = {},
    ): Promise<CustomerAuthActionResult> {
      if (state.status !== 'awaiting_verification') {
        return failed(state, INVALID_INPUT_FAILURE);
      }

      const request = buildCustomerVerificationRequest(state.challenge, otp, names);
      if (!request.ok) return failed(state, INVALID_INPUT_FAILURE);
      const version = ++operationVersion;
      transition({ type: 'verification_requested' });

      let response: unknown;

      try {
        response = await client.verifyOtp(request.value);
      } catch (error) {
        if (version !== operationVersion) {
          return failed(state, INVALID_INPUT_FAILURE);
        }
        const failure = mapStorefrontError(error);
        return failed(
          transition({ failure, type: 'verification_failed' }),
          failure,
        );
      }

      if (version !== operationVersion) {
        return failed(state, INVALID_INPUT_FAILURE);
      }

      const verified = validateCustomerVerificationResponse(response);

      if (!verified.ok) {
        return failed(
          transition({
            failure: INVALID_RESPONSE_FAILURE,
            type: 'verification_failed',
          }),
          INVALID_RESPONSE_FAILURE,
        );
      }

      try {
        await sessions.setToken(verified.value.token);
      } catch {
        await clearSession();
        if (version !== operationVersion) {
          return failed(state, INVALID_INPUT_FAILURE);
        }
        return failed(
          transition({
            failure: SECURE_STORAGE_FAILURE,
            type: 'verification_failed',
          }),
          SECURE_STORAGE_FAILURE,
        );
      }

      if (version !== operationVersion) {
        await clearSession();
        return failed(state, INVALID_INPUT_FAILURE);
      }

      return loadProfile(version);
    },
  });
}
