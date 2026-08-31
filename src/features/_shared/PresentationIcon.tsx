import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';

import { AppText } from '@/components/ui';
import { colors } from '@/theme';

const icons = {
  arrowBack: { ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back', fallback: '‹' },
  arrowForward: {
    ios: 'arrow.right',
    android: 'arrow_forward',
    web: 'arrow_forward',
    fallback: '›',
  },
  arrowUp: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward', fallback: '↑' },
  calendar: {
    ios: 'calendar',
    android: 'calendar_month',
    web: 'calendar_month',
    fallback: '□',
  },
  card: { ios: 'creditcard', android: 'credit_card', web: 'credit_card', fallback: '□' },
  check: { ios: 'checkmark', android: 'check', web: 'check', fallback: '✓' },
  close: { ios: 'xmark', android: 'close', web: 'close', fallback: 'x' },
  directions: {
    ios: 'arrow.triangle.turn.up.right.diamond',
    android: 'directions',
    web: 'directions',
    fallback: '↗',
  },
  error: {
    ios: 'exclamationmark',
    android: 'priority_high',
    web: 'priority_high',
    fallback: '!',
  },
  help: {
    ios: 'questionmark.circle',
    android: 'help',
    web: 'help',
    fallback: '?',
  },
  history: {
    ios: 'clock.arrow.circlepath',
    android: 'history',
    web: 'history',
    fallback: '↺',
  },
  heart: { ios: 'heart', android: 'favorite_border', web: 'favorite_border', fallback: '♡' },
  heartFilled: { ios: 'heart.fill', android: 'favorite', web: 'favorite', fallback: '♥' },
  home: { ios: 'house.fill', android: 'home', web: 'home', fallback: 'H' },
  location: {
    ios: 'location.fill',
    android: 'location_on',
    web: 'location_on',
    fallback: '•',
  },
  logout: {
    ios: 'rectangle.portrait.and.arrow.right',
    android: 'logout',
    web: 'logout',
    fallback: '→',
  },
  menu: {
    ios: 'list.bullet',
    android: 'restaurant_menu',
    web: 'restaurant_menu',
    fallback: 'M',
  },
  myLocation: {
    ios: 'location.circle',
    android: 'my_location',
    web: 'my_location',
    fallback: '◎',
  },
  offline: {
    ios: 'wifi.slash',
    android: 'signal_wifi_off',
    web: 'signal_wifi_off',
    fallback: 'x',
  },
  person: { ios: 'person.fill', android: 'person', web: 'person', fallback: '●' },
  search: {
    ios: 'magnifyingglass',
    android: 'search',
    web: 'search',
    fallback: '⌕',
  },
  share: {
    ios: 'square.and.arrow.up',
    android: 'share',
    web: 'share',
    fallback: '↗',
  },
  star: { ios: 'star', android: 'star', web: 'star', fallback: '☆' },
  starFilled: {
    ios: 'star.fill',
    android: 'star_rate',
    web: 'star_rate',
    fallback: '★',
  },
  store: { ios: 'storefront', android: 'storefront', web: 'storefront', fallback: '⌂' },
} as const;

export type PresentationIconName = keyof typeof icons;

type SymbolProps = ComponentProps<typeof SymbolView>;

export type PresentationIconProps = {
  color?: SymbolProps['tintColor'];
  name: PresentationIconName;
  size?: number;
};

export function PresentationIcon({ color = colors.ink, name, size = 20 }: PresentationIconProps) {
  const icon = icons[name];

  return (
    <SymbolView
      fallback={
        <AppText align="center" style={{ color, fontSize: size, lineHeight: size }}>
          {icon.fallback}
        </AppText>
      }
      name={{ android: icon.android, ios: icon.ios, web: icon.web }}
      size={size}
      tintColor={color}
    />
  );
}
