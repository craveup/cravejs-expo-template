import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { brandConfig } from '../../config/brand.config.ts';
import {
  welcomeOnboardingCopy,
  welcomeOnboardingLayout,
  welcomeOnboardingTypography,
} from './welcome-content.ts';

test('welcome content uses brand copy and keeps stable customer actions', () => {
  assert.equal(welcomeOnboardingCopy.body, brandConfig.copy.welcomeOnboardingBody);
  assert.equal(welcomeOnboardingCopy.title, brandConfig.copy.welcomeOnboardingTitle);
  assert.deepEqual(
    {
      accountAction: welcomeOnboardingCopy.accountAction,
      primaryAction: welcomeOnboardingCopy.primaryAction,
      title: welcomeOnboardingCopy.title,
    },
    {
      accountAction: 'I already have an account',
      primaryAction: 'Get started',
      title: brandConfig.copy.welcomeOnboardingTitle,
    },
  );
  assert.equal(welcomeOnboardingLayout.buttonMaxWidth > welcomeOnboardingLayout.contentMaxWidth, true);
  assert.equal(welcomeOnboardingTypography.title.fontSize > welcomeOnboardingTypography.body.fontSize, true);
});

test('welcome layout stays responsive and delegates navigation to callbacks', () => {
  const source = readFileSync(new URL('./WelcomeOnboarding.tsx', import.meta.url), 'utf8');

  assert.match(source, /width: '100%'/);
  assert.doesNotMatch(source, /width:\s*390/);
  assert.doesNotMatch(source, /expo-router|AsyncStorage|SecureStore|fetch\(/);
  assert.match(source, /<Button[\s\S]*onPress=\{onGetStarted\}/);
  assert.match(source, /accessibilityRole="link"[\s\S]*onPress=\{onSignIn\}/);
});

test('welcome content remains scrollable and preserves the circular live mark', () => {
  const source = readFileSync(new URL('./WelcomeOnboarding.tsx', import.meta.url), 'utf8');

  assert.match(source, /<ScrollView[\s\S]*contentContainerStyle=\{styles\.body\}/);
  assert.match(source, /body:\s*\{[\s\S]*flexGrow:\s*1/);
  assert.match(source, /mark:\s*\{[\s\S]*borderRadius:\s*radii\.pill/);
  assert.match(source, /markGlyph:\s*\{[\s\S]*fontFamily:\s*fontFamilies\.headingBold/);
  assert.doesNotMatch(source, /mark:\s*\{[\s\S]*borderRadius:\s*radii\.hero/);
});
