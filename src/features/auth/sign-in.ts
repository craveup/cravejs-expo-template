import { composeE164Phone } from './customer-auth-contract.ts';

export type SignInState = {
  canSubmit: boolean;
  digitCount: number;
};

export type PhoneSignInSubmission = {
  countryCode: string;
  identifier: string;
};

export function getPhoneDigits(identifier: string): string {
  return identifier.replace(/\D/g, '');
}

export function isPhoneIdentifierValid(identifier: string, countryCode = ''): boolean {
  return composeE164Phone(countryCode, identifier).ok;
}

export function getPhoneSignInSubmission(
  countryCode: string,
  identifier: string,
): PhoneSignInSubmission {
  return { countryCode, identifier };
}

export function getSignInState(
  identifier: string,
  pending: boolean,
  countryCode = '',
): SignInState {
  const digitCount = getPhoneDigits(identifier).length;
  return {
    canSubmit: !pending && isPhoneIdentifierValid(identifier, countryCode),
    digitCount,
  };
}
