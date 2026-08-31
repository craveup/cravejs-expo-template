import type { StorefrontFailure } from '../../lib/storefront-errors.ts';
import {
  composeE164Phone,
  createCustomerLoginRequest,
  type CustomerLoginContractRequest,
} from './customer-auth-contract.ts';
import type { CustomerAuthState } from './customer-auth-state.ts';
import type { PhoneSignInSubmission } from './sign-in.ts';

export type CustomerAuthPresentationFailure =
  | 'invalid'
  | 'network'
  | 'rate_limited'
  | 'session'
  | 'unknown';

export type SignInAuthPresentation = Readonly<{
  failure?: CustomerAuthPresentationFailure;
  pending: boolean;
}>;

export type OtpAuthPresentation = Readonly<{
  failure?: CustomerAuthPresentationFailure;
  identifierLabel: string;
  pending: boolean;
  resendAvailable: boolean;
}>;

export function toCustomerAuthPresentationFailure(
  failure?: StorefrontFailure,
): CustomerAuthPresentationFailure | undefined {
  if (!failure) return undefined;

  switch (failure.kind) {
    case 'invalid_request':
    case 'forbidden':
      return 'invalid';
    case 'rate_limited':
      return 'rate_limited';
    case 'timeout':
    case 'unavailable':
      return 'network';
    case 'authentication_required':
      return 'session';
    case 'conflict':
    case 'not_found':
    case 'unknown':
      return 'unknown';
  }
}

export function buildPhoneChallengeRequest(
  merchantSlug: string,
  submission: PhoneSignInSubmission,
): CustomerLoginContractRequest | undefined {
  const identifier = composeE164Phone(
    submission.countryCode,
    submission.identifier,
  );
  if (!identifier.ok) return undefined;

  const request = createCustomerLoginRequest(merchantSlug, identifier.value);
  return request.ok ? request.value : undefined;
}

export function maskCustomerIdentifier(identifier: string): string {
  if (identifier.startsWith('+')) {
    const digits = identifier.replace(/\D/g, '');
    const suffix = digits.slice(-4);
    return suffix.length === 4 ? `•••• ${suffix}` : 'your phone';
  }

  const separator = identifier.lastIndexOf('@');
  if (separator > 0 && separator < identifier.length - 1) {
    return `${identifier[0]}•••@${identifier.slice(separator + 1)}`;
  }

  return 'your account';
}

export function toSignInAuthPresentation(
  state: CustomerAuthState,
): SignInAuthPresentation {
  return Object.freeze({
    ...(state.status === 'signed_out' && state.failure
      ? { failure: toCustomerAuthPresentationFailure(state.failure) }
      : {}),
    pending: state.status === 'requesting_challenge' && !state.previousChallenge,
  });
}

export function toOtpAuthPresentation(
  state: CustomerAuthState,
): OtpAuthPresentation | undefined {
  if (state.status === 'requesting_challenge' && state.previousChallenge) {
    return Object.freeze({
      identifierLabel: maskCustomerIdentifier(
        state.previousChallenge.identifierString,
      ),
      pending: true,
      resendAvailable: false,
    });
  }

  if (state.status === 'awaiting_verification') {
    return Object.freeze({
      ...(state.failure
        ? { failure: toCustomerAuthPresentationFailure(state.failure) }
        : {}),
      identifierLabel: maskCustomerIdentifier(state.challenge.identifierString),
      pending: false,
      resendAvailable: true,
    });
  }

  if (state.status === 'verifying') {
    return Object.freeze({
      identifierLabel: maskCustomerIdentifier(state.challenge.identifierString),
      pending: true,
      resendAvailable: false,
    });
  }

  return undefined;
}
