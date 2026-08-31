import { normalizeMerchantSlug } from '../../domain/storefront/merchant-scope.ts';
import {
  assertStorefrontSecret,
  StorefrontSessionContractError,
} from '../../lib/storefront-session-scope.ts';

export type CustomerAuthDelivery = 'email' | 'sms';

export type CustomerLoginContractRequest = {
  identifierString: string;
  merchantSlug: string;
};

export type CustomerLoginContractResponse = {
  delivery: CustomerAuthDelivery;
  methodId: string;
};

export type CustomerAuthChallenge = CustomerLoginContractRequest &
  CustomerLoginContractResponse;

export type CustomerVerificationContractRequest = CustomerLoginContractRequest & {
  customerName?: string;
  lastName?: string;
  methodId: string;
  otp: string;
};

export type CustomerVerificationContractResponse = {
  token: string;
};

export type StorefrontCustomerContract = Readonly<{
  customerEmail: string | null;
  customerName: string;
  id: string;
  lastName: string;
  phoneNumber: string | null;
  profilePicture: string;
}>;

export type CustomerAuthContractField =
  | 'customerName'
  | 'delivery'
  | 'id'
  | 'identifierString'
  | 'lastName'
  | 'merchantSlug'
  | 'methodId'
  | 'otp'
  | 'profile'
  | 'token';

export type CustomerAuthContractResult<T> =
  | { ok: true; value: T }
  | { field: CustomerAuthContractField; ok: false };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const OTP_PATTERN = /^\d{6}$/;

function failure(field: CustomerAuthContractField): CustomerAuthContractResult<never> {
  return { field, ok: false };
}

export function normalizeCustomerEmail(email: string): CustomerAuthContractResult<string> {
  const normalized = email.trim().toLowerCase();

  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    return failure('identifierString');
  }

  return { ok: true, value: normalized };
}

export function composeE164Phone(
  countryCode: string,
  nationalNumber: string,
): CustomerAuthContractResult<string> {
  if (!/^\+?[\d\s()-]+$/.test(countryCode) || !/^[\d\s().-]+$/.test(nationalNumber)) {
    return failure('identifierString');
  }

  const countryDigits = countryCode.replace(/\D/g, '');
  const nationalDigits = nationalNumber.replace(/\D/g, '');
  const normalized = `+${countryDigits}${nationalDigits}`;

  if (countryDigits.length < 1 || countryDigits.length > 3 || !E164_PATTERN.test(normalized)) {
    return failure('identifierString');
  }

  return { ok: true, value: normalized };
}

export function isCustomerOtpValid(otp: string): boolean {
  return OTP_PATTERN.test(otp);
}

function isNormalizedIdentifier(identifierString: string): boolean {
  if (
    identifierString.length < 3 ||
    identifierString.length > 254 ||
    identifierString !== identifierString.trim()
  ) {
    return false;
  }

  if (E164_PATTERN.test(identifierString)) {
    return true;
  }

  return (
    identifierString === identifierString.toLowerCase() && EMAIL_PATTERN.test(identifierString)
  );
}

export function createCustomerLoginRequest(
  merchantSlug: string,
  identifierString: string,
): CustomerAuthContractResult<CustomerLoginContractRequest> {
  const normalizedMerchant = normalizeMerchantSlug(merchantSlug);

  if (!normalizedMerchant.ok) {
    return normalizedMerchant;
  }

  if (!isNormalizedIdentifier(identifierString)) {
    return failure('identifierString');
  }

  return {
    ok: true,
    value: {
      identifierString,
      merchantSlug: normalizedMerchant.value,
    },
  };
}

function validateLoginResponse(
  response: unknown,
): CustomerAuthContractResult<CustomerLoginContractResponse> {
  if (typeof response !== 'object' || response === null) {
    return failure('methodId');
  }

  const methodId = Reflect.get(response, 'methodId');
  const delivery = Reflect.get(response, 'delivery');

  if (
    typeof methodId !== 'string' ||
    methodId.length < 1 ||
    methodId.length > 128 ||
    methodId !== methodId.trim()
  ) {
    return failure('methodId');
  }

  if (delivery !== 'email' && delivery !== 'sms') {
    return failure('delivery');
  }

  return { ok: true, value: { delivery, methodId } };
}

export function createCustomerAuthChallenge(
  loginRequest: CustomerLoginContractRequest,
  response: unknown,
): CustomerAuthContractResult<CustomerAuthChallenge> {
  const validatedRequest = createCustomerLoginRequest(
    loginRequest.merchantSlug,
    loginRequest.identifierString,
  );

  if (!validatedRequest.ok) {
    return validatedRequest;
  }

  const validatedResponse = validateLoginResponse(response);

  if (!validatedResponse.ok) {
    return validatedResponse;
  }

  return {
    ok: true,
    value: { ...validatedRequest.value, ...validatedResponse.value },
  };
}

export function replaceCustomerAuthChallenge(
  challenge: CustomerAuthChallenge,
  response: unknown,
): CustomerAuthContractResult<CustomerAuthChallenge> {
  return createCustomerAuthChallenge(
    {
      identifierString: challenge.identifierString,
      merchantSlug: challenge.merchantSlug,
    },
    response,
  );
}

function normalizeOptionalName(
  value: string | undefined,
  field: 'customerName' | 'lastName',
): CustomerAuthContractResult<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const normalized = value.trim();

  if (normalized.length > 100) {
    return failure(field);
  }

  return { ok: true, value: normalized || undefined };
}

export function buildCustomerVerificationRequest(
  challenge: CustomerAuthChallenge,
  otp: string,
  names: { customerName?: string; lastName?: string } = {},
): CustomerAuthContractResult<CustomerVerificationContractRequest> {
  const validatedChallenge = createCustomerAuthChallenge(challenge, challenge);

  if (!validatedChallenge.ok) {
    return validatedChallenge;
  }

  if (!isCustomerOtpValid(otp)) {
    return failure('otp');
  }

  const customerName = normalizeOptionalName(names.customerName, 'customerName');
  const lastName = normalizeOptionalName(names.lastName, 'lastName');

  if (!customerName.ok) {
    return customerName;
  }

  if (!lastName.ok) {
    return lastName;
  }

  return {
    ok: true,
    value: {
      ...(customerName.value ? { customerName: customerName.value } : {}),
      identifierString: validatedChallenge.value.identifierString,
      ...(lastName.value ? { lastName: lastName.value } : {}),
      merchantSlug: validatedChallenge.value.merchantSlug,
      methodId: validatedChallenge.value.methodId,
      otp,
    },
  };
}

export function validateCustomerVerificationResponse(
  response: unknown,
): CustomerAuthContractResult<CustomerVerificationContractResponse> {
  if (typeof response !== 'object' || response === null) {
    return failure('token');
  }

  const token = Reflect.get(response, 'token');

  if (typeof token !== 'string') {
    return failure('token');
  }

  try {
    return {
      ok: true,
      value: { token: assertStorefrontSecret(token, 'token') },
    };
  } catch (error) {
    if (error instanceof StorefrontSessionContractError) {
      return failure('token');
    }
    throw error;
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function validateStorefrontCustomer(
  response: unknown,
): CustomerAuthContractResult<StorefrontCustomerContract> {
  if (typeof response !== 'object' || response === null) {
    return failure('profile');
  }

  const id = Reflect.get(response, 'id');
  const profilePicture = Reflect.get(response, 'profilePicture');
  const customerEmail = Reflect.get(response, 'customerEmail');
  const customerName = Reflect.get(response, 'customerName');
  const lastName = Reflect.get(response, 'lastName');
  const phoneNumber = Reflect.get(response, 'phoneNumber');

  if (typeof id !== 'string' || id.length < 1 || id !== id.trim()) {
    return failure('id');
  }
  if (
    typeof profilePicture !== 'string' ||
    typeof customerName !== 'string' ||
    typeof lastName !== 'string' ||
    !isNullableString(customerEmail) ||
    !isNullableString(phoneNumber)
  ) {
    return failure('profile');
  }

  return {
    ok: true,
    value: Object.freeze({
      customerEmail,
      customerName,
      id,
      lastName,
      phoneNumber,
      profilePicture,
    }),
  };
}
