import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { colors, fontFamilies, radii, spacing } from '@/theme';

import {
  welcomeOnboardingColors,
  welcomeOnboardingCopy,
  welcomeOnboardingLayout,
  welcomeOnboardingTypography,
} from './welcome-content';

export type WelcomeOnboardingProps = {
  onGetStarted: () => void;
  onSignIn: () => void;
};

export function WelcomeOnboarding({ onGetStarted, onSignIn }: WelcomeOnboardingProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.body} style={styles.scrollView}>
        <View style={styles.content}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.mark}>
            <Text style={styles.markGlyph}>🧋</Text>
          </View>

          <AppText
            accessibilityRole="header"
            align="center"
            color="surface"
            style={styles.title}
            variant="title"
          >
            {welcomeOnboardingCopy.title}
          </AppText>

          <AppText
            align="center"
            color="heroSupporting"
            style={styles.description}
            variant="body"
          >
            {welcomeOnboardingCopy.body}
          </AppText>

          <View
            accessibilityLabel="Onboarding, page 1 of 3"
            accessibilityRole="text"
            accessible
            style={styles.dots}
          >
            <View style={[styles.dot, styles.activeDot]} />
            <View style={[styles.dot, styles.inactiveDot]} />
            <View style={[styles.dot, styles.inactiveDot]} />
          </View>

          <Button
            label={welcomeOnboardingCopy.primaryAction}
            onPress={onGetStarted}
            style={styles.primaryAction}
          />

          <Pressable
            accessibilityLabel={welcomeOnboardingCopy.accountAction}
            accessibilityRole="link"
            onPress={onSignIn}
            style={({ pressed }) => [styles.accountAction, pressed && styles.pressed]}
          >
            <AppText align="center" color="heroSupporting" variant="caption">
              {welcomeOnboardingCopy.accountAction}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  body: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    flexGrow: 1,
    paddingHorizontal: spacing['6xl'],
  },
  scrollView: {
    backgroundColor: colors.ink,
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingTop: welcomeOnboardingLayout.markTopFromBody,
    width: '100%',
  },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: welcomeOnboardingLayout.markSize,
    justifyContent: 'center',
    width: welcomeOnboardingLayout.markSize,
  },
  markGlyph: {
    fontFamily: fontFamilies.headingBold,
    fontSize: welcomeOnboardingTypography.mark.fontSize,
    lineHeight: welcomeOnboardingTypography.mark.lineHeight,
    textAlign: 'center',
  },
  title: {
    fontFamily: fontFamilies.headingExtraBold,
    fontSize: welcomeOnboardingTypography.title.fontSize,
    letterSpacing: 0,
    lineHeight: welcomeOnboardingTypography.title.lineHeight,
    marginTop: welcomeOnboardingLayout.sectionGap,
    maxWidth: welcomeOnboardingLayout.contentMaxWidth,
    width: '100%',
  },
  description: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: welcomeOnboardingTypography.body.fontSize,
    lineHeight: welcomeOnboardingTypography.body.lineHeight,
    marginTop: welcomeOnboardingLayout.sectionGap,
    maxWidth: welcomeOnboardingLayout.contentMaxWidth,
    width: '100%',
  },
  dots: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: welcomeOnboardingLayout.dotGap,
    height: welcomeOnboardingLayout.dotContainerHeight,
    marginTop: welcomeOnboardingLayout.sectionGap,
  },
  dot: {
    borderRadius: radii.xs,
    height: welcomeOnboardingLayout.dotSize,
    width: welcomeOnboardingLayout.dotSize,
  },
  activeDot: {
    backgroundColor: colors.accent,
  },
  inactiveDot: {
    backgroundColor: welcomeOnboardingColors.inactiveDot,
  },
  primaryAction: {
    marginTop: welcomeOnboardingLayout.spacerBeforeAction,
    maxWidth: welcomeOnboardingLayout.buttonMaxWidth,
    width: '100%',
  },
  accountAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: welcomeOnboardingLayout.accountActionHeight,
    maxWidth: welcomeOnboardingLayout.buttonMaxWidth,
    width: '100%',
  },
  pressed: {
    opacity: 0.78,
  },
});
