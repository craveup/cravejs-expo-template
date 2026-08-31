export const OTP_LENGTH = 6;

export type OtpPresentationState = {
  canResend: boolean;
  canSubmit: boolean;
  hasError: boolean;
};

export function isOtpValid(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export function acceptsOtpInput(code: string): boolean {
  return /^\d{0,6}$/.test(code);
}

export function getOtpPresentationState(
  code: string,
  pending: boolean,
  resendAvailable: boolean,
  errorMessage?: string,
): OtpPresentationState {
  return {
    canResend: resendAvailable && !pending,
    canSubmit: isOtpValid(code) && !pending,
    hasError: Boolean(errorMessage),
  };
}
