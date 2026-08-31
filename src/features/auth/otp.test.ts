import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { acceptsOtpInput, getOtpPresentationState, isOtpValid } from './otp.ts';

test('OTP accepts exactly six numeric digits without coercion', () => {
  assert.equal(isOtpValid('123456'), true);
  assert.equal(isOtpValid('12345'), false);
  assert.equal(isOtpValid('1234567'), false);
  assert.equal(isOtpValid('12 456'), false);
  assert.equal(isOtpValid('12345a'), false);
  assert.equal(acceptsOtpInput(''), true);
  assert.equal(acceptsOtpInput('001234'), true);
  assert.equal(acceptsOtpInput('0012345'), false);
});

test('OTP submission and resend states respect pending and availability', () => {
  assert.deepEqual(getOtpPresentationState('123456', false, true), {
    canResend: true,
    canSubmit: true,
    hasError: false,
  });
  assert.deepEqual(getOtpPresentationState('123456', true, true, 'Try again'), {
    canResend: false,
    canSubmit: false,
    hasError: true,
  });
  assert.equal(getOtpPresentationState('12345', false, false).canSubmit, false);
});

test('editing after an error can return to a valid state without persisting the code', () => {
  const errored = getOtpPresentationState('111111', false, true, 'That code did not work');
  const recovered = getOtpPresentationState('222222', false, true);
  assert.equal(errored.hasError, true);
  assert.deepEqual(recovered, { canResend: true, canSubmit: true, hasError: false });
});

test('OTP keeps the reviewed presentation with the released six-digit contract', () => {
  const source = readFileSync(new URL('./OtpScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /VERIFY/);
  assert.match(source, /Enter the 6-digit code/);
  assert.match(source, /Sent to \{identifierLabel\}/);
  assert.match(source, /label="Continue"/);
  assert.match(source, /isEntered \|\| isCurrent/);
  assert.match(source, /variant="dark"/);
  assert.match(source, /variant="ghost"/);
  assert.doesNotMatch(source, /code sent to your phone/i);
  assert.doesNotMatch(source, /4-digit/);
});
