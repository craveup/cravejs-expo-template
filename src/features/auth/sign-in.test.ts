import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { brandConfig } from '../../config/brand.config.ts';

import {
  getPhoneDigits,
  getPhoneSignInSubmission,
  getSignInState,
  isPhoneIdentifierValid,
} from './sign-in.ts';

test('phone validation accepts supported characters and counts the displayed country code', () => {
  const identifier = '(310) 555-0142';
  assert.equal(getPhoneDigits(identifier), '3105550142');
  assert.equal(isPhoneIdentifierValid(identifier, '+1'), true);
  assert.equal(isPhoneIdentifierValid('12345'), false);
  assert.equal(isPhoneIdentifierValid('1234567890123456'), false);
  assert.equal(isPhoneIdentifierValid('call1234567now'), false);
  assert.equal(isPhoneIdentifierValid('(310) 555-0142', '+1'), true);
  assert.equal(isPhoneIdentifierValid('+1 310 555 0142', '+1'), false);
  assert.equal(isPhoneIdentifierValid('123456789012345', '+1'), false);
  assert.deepEqual(getPhoneSignInSubmission('+1', identifier), {
    countryCode: '+1',
    identifier,
  });
});

test('sign-in submission is disabled for invalid input and while pending', () => {
  assert.deepEqual(getSignInState('12345', false), { canSubmit: false, digitCount: 5 });
  assert.deepEqual(getSignInState('(310) 555-0142', true, '+1'), {
    canSubmit: false,
    digitCount: 10,
  });
  assert.deepEqual(getSignInState('(310) 555-0142', false, '+1'), {
    canSubmit: true,
    digitCount: 10,
  });
});

test('sign-in preserves the reviewed heading while removing the unsupported favourites promise', () => {
  const source = readFileSync(new URL('./SignInScreen.tsx', import.meta.url), 'utf8');
  assert.equal(brandConfig.copy.signInClubLabel.length > 1, true);
  assert.match(source, /brandConfig\.copy\.signInClubLabel/);
  assert.match(source, /Points on every cup/);
  assert.match(source, /points and past orders together/);
  assert.match(source, /variant="ghost"/);
  assert.match(source, /borderColor: colors\.accent/);
  assert.doesNotMatch(source, />\s*Mobile number\s*</);
  assert.doesNotMatch(source, /favourites together/i);
  assert.match(source, /countryCode = '\+1'/);
  assert.match(source, /getPhoneSignInSubmission/);
});
