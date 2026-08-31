import type { CustomerSessionStore } from './customer-session.ts';
import {
  mapStorefrontError,
  type StorefrontFailure,
} from './storefront-errors.ts';

export const SECURE_STORAGE_FAILURE: StorefrontFailure = Object.freeze({
  code: 'SECURE_STORAGE_UNAVAILABLE',
  kind: 'unavailable',
  retryable: true,
});

export type CustomerAuthenticationFailure = StorefrontFailure &
  Readonly<{ kind: 'authentication_required' }>;

export type CustomerAuthenticationFailureHandler = (
  failure: CustomerAuthenticationFailure,
) => Promise<StorefrontFailure>;

export function isCustomerAuthenticationFailure(
  failure: StorefrontFailure,
): failure is CustomerAuthenticationFailure {
  return failure.kind === 'authentication_required';
}

export async function mapCustomerRequestFailure(
  error: unknown,
  sessions: CustomerSessionStore,
  onAuthenticationFailure?: CustomerAuthenticationFailureHandler,
): Promise<StorefrontFailure> {
  const failure = mapStorefrontError(error);
  if (!isCustomerAuthenticationFailure(failure)) return failure;
  if (onAuthenticationFailure) return onAuthenticationFailure(failure);

  try {
    await sessions.clear();
    return failure;
  } catch {
    return SECURE_STORAGE_FAILURE;
  }
}
