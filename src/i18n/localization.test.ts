import assert from 'node:assert/strict';
import test from 'node:test';

import { brandConfig } from '../config/brand.config.ts';
import {
  formatCurrency,
  formatDate,
  formatMeasurement,
  formatPlural,
  formatSignedNumber,
  formatTime,
  getLocaleDirection,
  translate,
} from './localization.ts';

test('customer marketing copy comes from the selected brand profile', () => {
  assert.deepEqual(
    {
      categoriesTitle: translate('en', 'catalog.categoriesTitle'),
      footerBody: translate('en', 'catalog.footerBody'),
      footerTitle: translate('en', 'catalog.footerTitle'),
      heroEyebrow: translate('en', 'catalog.heroEyebrow'),
      heroTitle: translate('en', 'catalog.heroTitle'),
    },
    {
      categoriesTitle: brandConfig.copy.catalogCategoriesTitle,
      footerBody: brandConfig.copy.catalogFooterBody,
      footerTitle: brandConfig.copy.catalogFooterTitle,
      heroEyebrow: brandConfig.copy.catalogHeroEyebrow,
      heroTitle: brandConfig.copy.catalogHeroTitle,
    },
  );
});

test('English, pseudo-long, and RTL test locales share typed keyed copy', () => {
  assert.equal(translate('en', 'catalog.title'), 'Menu');
  assert.match(translate('en-XA', 'catalog.title'), /^\[!! Menu Menu !!\]$/);
  assert.equal(translate('ar-XB', 'catalog.title'), 'Menu');
  assert.equal(
    translate('en', 'favourites.action.addAccessibility', { name: 'Sample Product' }),
    'Add Sample Product to bag',
  );
  assert.equal(
    translate('en', 'orders.history.offline'),
    'You are offline. Check your connection and try again.',
  );
  assert.equal(
    translate('en', 'orders.history.loadMoreError'),
    'We could not load more orders.',
  );
  assert.equal(translate('en', 'delivery.status.title'), 'Delivery status');
  assert.equal(translate('en', 'delivery.status.status'), 'ORDER STATUS');
  assert.match(
    translate('en-XA', 'delivery.status.unavailable.title'),
    /^\[!! .+ .+ !!\]$/,
  );
  assert.equal(
    translate('en', 'favourites.missingProduct'),
    'This saved item is no longer available.',
  );
  assert.equal(
    translate('en', 'rewards.account.balanceAccessibility', { points: 340 }),
    '340 reward points available',
  );
  assert.deepEqual(
    {
      club: translate('en', 'account.club'),
      help: translate('en', 'account.action.help'),
      history: translate('en', 'account.action.orderHistory'),
      loading: translate('en', 'account.loading'),
      savedStores: translate('en', 'account.action.savedStores'),
      signOut: translate('en', 'account.action.signOut'),
    },
    {
      club: brandConfig.copy.signInClubLabel,
      help: 'Help & support',
      history: 'Order history',
      loading: 'Loading your account',
      savedStores: 'Saved stores',
      signOut: 'Sign out',
    },
  );
  assert.equal(
    translate('en', 'account.balanceAccessibility', {
      balance: '340 points',
      club: brandConfig.copy.signInClubLabel,
    }),
    `${brandConfig.copy.signInClubLabel}, 340 points available`,
  );
  assert.match(translate('en-XA', 'account.action.help'), /^\[!! .+ .+ !!\]$/);
  assert.equal(
    translate('en', 'rewards.redemption.redeemTitle', { points: 100 }),
    'Redeem for 100 pts?',
  );
  assert.equal(translate('en', 'rewards.history.title'), 'Points history');
  assert.equal(
    translate('en', 'search.resultCountOther', { count: 3, query: 'boba' }),
    '3 odd ones for “boba”',
  );
  assert.equal(
    translate('en', 'search.noResultsTitle', { query: 'matcha' }),
    'No odd ones match “matcha”',
  );
  assert.match(
    translate('en-XA', 'search.noResultsBody'),
    /^\[!! .+ .+ !!\]$/,
  );
  assert.equal(translate('en', 'system.offline.title'), "You've gone off the grid");
  assert.equal(
    translate('en', 'system.reference.accessibility', {
      requestId: 'request-fixture',
    }),
    'Error reference request-fixture',
  );
  assert.match(translate('en-XA', 'system.error.supporting'), /^\[!! .+ .+ !!\]$/);
  assert.equal(translate('ar-XB', 'system.action.back'), 'Go back');
  assert.equal(translate('en', 'system.updateRequired.title'), 'Time for a fresh cup');
  assert.equal(
    translate('en', 'system.updateRequired.supporting'),
    'This version of the app is no longer supported. Update to keep ordering.',
  );
  assert.equal(translate('en', 'system.updateRequired.action'), 'Update now');
  assert.equal(
    translate('en', 'system.updateRequired.version', { version: '2.4.1' }),
    'Version 2.4.1 \u00b7 required',
  );
  assert.match(
    translate('en-XA', 'system.updateRequired.supporting'),
    /^\[!! .+ .+ !!\]$/,
  );
  assert.equal(translate('ar-XB', 'system.updateRequired.action'), 'Update now');
  assert.equal(getLocaleDirection('en'), 'ltr');
  assert.equal(getLocaleDirection('ar-XB'), 'rtl');
});

test('locale formatters preserve supplied authoritative values and fail closed for invalid input', () => {
  assert.equal(formatCurrency('en', 12.5, 'USD'), '$12.50');
  assert.equal(formatCurrency('en', Number.NaN, 'USD'), null);
  assert.equal(formatCurrency('en', 12.5, 'usd'), null);
  assert.equal(formatDate('en', 'not-a-date'), null);
  assert.equal(formatDate('en', Date.now(), { timeZone: 'Mars/Olympus' }), null);
  assert.match(formatDate('en', '2026-08-10T00:00:00.000Z', { timeZone: 'UTC', year: 'numeric' }) ?? '', /2026/);
  assert.match(
    formatTime('en', '2026-08-10T15:30:00.000Z', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) ?? '',
    /03:30 PM/,
  );
  assert.match(formatMeasurement('en', 1.5, 'mile') ?? '', /1\.5/);
  assert.equal(formatMeasurement('en', Number.NaN, 'mile'), null);
  assert.equal(formatSignedNumber('en', 24), '+24');
  assert.equal(formatSignedNumber('en', -100), '−100');
  assert.equal(formatSignedNumber('en', Number.NaN), null);
  assert.equal(formatPlural('en', 1, { one: 'item', other: 'items' }), '1 item');
  assert.equal(formatPlural('en', 2, { one: 'item', other: 'items' }), '2 items');
});
