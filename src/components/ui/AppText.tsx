import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { colors, textStyles, type ColorToken, type TextVariant } from '@/theme';

export type AppTextProps = Omit<TextProps, 'children'> & {
  align?: TextStyle['textAlign'];
  children: ReactNode;
  color?: ColorToken;
  style?: StyleProp<TextStyle>;
  variant?: TextVariant;
};

export function AppText({
  align,
  allowFontScaling = true,
  children,
  color = 'ink',
  style,
  variant = 'body',
  ...props
}: AppTextProps) {
  return (
    <Text
      {...props}
      allowFontScaling={allowFontScaling}
      style={[textStyles[variant], { color: colors[color], textAlign: align }, style]}
    >
      {children}
    </Text>
  );
}
