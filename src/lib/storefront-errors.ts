export type StorefrontFailureKind =
  | 'authentication_required'
  | 'conflict'
  | 'forbidden'
  | 'invalid_request'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable'
  | 'unknown';

export type StorefrontFailure = Readonly<{
  code?: string;
  kind: StorefrontFailureKind;
  requestId?: string;
  retryAfterMs?: number;
  retryable: boolean;
  status?: number;
}>;

const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,79}$/;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isSafeStorefrontCode(value: unknown): value is string {
  return typeof value === 'string' && SAFE_CODE_PATTERN.test(value);
}

export function isSafeStorefrontRequestId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REQUEST_ID_PATTERN.test(value);
}

function property(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Reflect.get(value, key);
}

function safeCode(error: unknown): string | undefined {
  const code = property(error, 'code');
  return isSafeStorefrontCode(code) ? code : undefined;
}

function safeRequestId(error: unknown): string | undefined {
  const requestId = property(error, 'requestId');
  return isSafeStorefrontRequestId(requestId) ? requestId : undefined;
}

function safeStatus(error: unknown): number | undefined {
  const status = property(error, 'status');
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined;
}

function safeRetryAfterMs(error: unknown): number | undefined {
  const retryAfterMs = property(error, 'retryAfterMs');
  return typeof retryAfterMs === 'number' &&
    Number.isInteger(retryAfterMs) &&
    retryAfterMs >= 0 &&
    retryAfterMs <= 86_400_000
    ? retryAfterMs
    : undefined;
}

function errorName(error: unknown): string | undefined {
  const name = property(error, 'name');
  return typeof name === 'string' ? name : undefined;
}

function classify(
  name: string | undefined,
  code: string | undefined,
  status: number | undefined,
): Pick<StorefrontFailure, 'kind' | 'retryable'> {
  if (name === 'StorefrontTimeoutError' || status === 408) {
    return { kind: 'timeout', retryable: true };
  }
  if (
    code === 'CART_CONFLICT' ||
    code === 'REVISION_REQUIRED' ||
    status === 409
  ) {
    return { kind: 'conflict', retryable: false };
  }
  if (
    status === 401 ||
    code === 'CUSTOMER_AUTH_REQUIRED' ||
    code === 'CART_OR_CUSTOMER_AUTH_REQUIRED'
  ) {
    return { kind: 'authentication_required', retryable: false };
  }
  if (status === 403 || code === 'CART_CAPABILITY_REQUIRED') {
    return { kind: 'forbidden', retryable: false };
  }
  if (status === 404 || code === 'NOT_FOUND') {
    return { kind: 'not_found', retryable: false };
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return { kind: 'rate_limited', retryable: true };
  }
  if (status === 400 || status === 422) {
    return { kind: 'invalid_request', retryable: false };
  }
  if (status !== undefined && status >= 500) {
    return { kind: 'unavailable', retryable: true };
  }
  if (
    name === 'StorefrontProtocolError' ||
    name === 'TypeError' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENETUNREACH' ||
    code === 'ENOTFOUND'
  ) {
    return { kind: 'unavailable', retryable: true };
  }

  return { kind: 'unknown', retryable: false };
}

export function mapStorefrontError(error: unknown): StorefrontFailure {
  const code = safeCode(error);
  const requestId = safeRequestId(error);
  const retryAfterMs = safeRetryAfterMs(error);
  const status = safeStatus(error);
  const classification = classify(errorName(error), code, status);

  return Object.freeze({
    ...(code ? { code } : {}),
    ...classification,
    ...(requestId ? { requestId } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    ...(status ? { status } : {}),
  });
}
