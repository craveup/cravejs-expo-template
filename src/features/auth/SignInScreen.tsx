import { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, Button, IconButton, Screen, Surface } from '@/components/ui';
import { brandConfig } from '@/config/brand.config';
import { colors, radii, sizes, spacing, textStyles } from '@/theme';

import { PresentationIcon } from '../_shared/PresentationIcon';
import { getPhoneSignInSubmission, getSignInState, type PhoneSignInSubmission } from './sign-in';

export type SignInScreenProps = {
  countryCode?: string;
  errorMessage?: string;
  identifier: string;
  onBack: () => void;
  onIdentifierChange: (value: string) => void;
  onOpenPrivacyPolicy?: () => void;
  onOpenTerms?: () => void;
  onSubmit: (submission: PhoneSignInSubmission) => void;
  pending?: boolean;
};

export function SignInScreen({
  countryCode = '+1',
  errorMessage,
  identifier,
  onBack,
  onIdentifierChange,
  onOpenPrivacyPolicy,
  onOpenTerms,
  onSubmit,
  pending = false,
}: SignInScreenProps) {
  const state = useMemo(
    () => getSignInState(identifier, pending, countryCode),
    [countryCode, identifier, pending],
  );
  const submit = () => onSubmit(getPhoneSignInSubmission(countryCode, identifier));

  return (
    <Screen
      accessibilityLabel="Phone sign in"
      contentContainerStyle={styles.screenContent}
      padded={false}
      style={styles.screen}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <IconButton
            accessibilityLabel="Go back"
            onPress={onBack}
            style={styles.backButton}
            variant="ghost"
          >
            <PresentationIcon name="arrowBack" size={21} />
          </IconButton>

          <View style={styles.intro}>
            <AppText color="accent" variant="label">
              {brandConfig.copy.signInClubLabel}
            </AppText>
            <AppText variant="title">Points on every cup</AppText>
            <AppText color="textMuted" variant="body">
              Pop in your number and we&apos;ll keep your points and past orders together.
            </AppText>
          </View>

          <View style={styles.fieldGroup}>
            <Surface
              accessibilityLabel="Mobile number field"
              padding="none"
              radius="md"
              style={[styles.phoneField, Boolean(errorMessage) && styles.fieldError]}
            >
              <View style={styles.countryCode}>
                <AppText variant="bodyMedium">{countryCode}</AppText>
              </View>
              <TextInput
                accessibilityLabel="Mobile number"
                autoComplete="tel"
                cursorColor={colors.accent}
                enterKeyHint="send"
                inputMode="tel"
                keyboardType="phone-pad"
                onChangeText={onIdentifierChange}
                onSubmitEditing={() => {
                  if (state.canSubmit) submit();
                }}
                placeholder="(310) 555-0142"
                placeholderTextColor={colors.iconMuted}
                returnKeyType="send"
                style={styles.input}
                value={identifier}
              />
            </Surface>
            {errorMessage ? (
              <AppText accessibilityLiveRegion="polite" color="danger" variant="caption">
                {errorMessage}
              </AppText>
            ) : null}
          </View>

          <Button
            accessibilityHint="Requests a sign-in code for this phone number"
            disabled={!state.canSubmit}
            label="Send me a code"
            loading={pending}
            onPress={submit}
            style={styles.submit}
          />

          <View style={styles.legal}>
            <AppText color="textSubtle" variant="caption">
              By continuing, you agree to our
            </AppText>
            {onOpenTerms ? (
              <Pressable accessibilityRole="link" hitSlop={8} onPress={onOpenTerms}>
                <AppText color="ink" style={styles.legalLink} variant="caption">
                  Terms
                </AppText>
              </Pressable>
            ) : (
              <AppText color="textSubtle" variant="caption">
                Terms
              </AppText>
            )}
            <AppText color="textSubtle" variant="caption">
              and
            </AppText>
            {onOpenPrivacyPolicy ? (
              <Pressable accessibilityRole="link" hitSlop={8} onPress={onOpenPrivacyPolicy}>
                <AppText color="ink" style={styles.legalLink} variant="caption">
                  Privacy Policy
                </AppText>
              </Pressable>
            ) : (
              <AppText color="textSubtle" variant="caption">
                Privacy Policy
              </AppText>
            )}
            <AppText color="textSubtle" variant="caption">
              .
            </AppText>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
  },
  content: {
    flex: 1,
    paddingBottom: spacing['5xl'],
    paddingHorizontal: spacing['6xl'],
    paddingTop: spacing['5xl'],
  },
  countryCode: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: spacing['2xl'],
    paddingRight: spacing.md,
  },
  fieldError: {
    borderColor: colors.danger,
  },
  fieldGroup: {
    gap: spacing.md,
    marginTop: spacing['2xl'],
  },
  input: {
    ...textStyles.bodyMedium,
    color: colors.ink,
    flex: 1,
    minHeight: sizes.standardControl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing['2xl'],
  },
  intro: {
    gap: spacing.xl,
    marginTop: spacing['7xl'],
    maxWidth: 320,
  },
  keyboardView: {
    flex: 1,
  },
  legal: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'flex-start',
    marginTop: spacing['2xl'],
  },
  legalLink: {
    textDecorationLine: 'underline',
  },
  phoneField: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderWidth: 2,
    flexDirection: 'row',
    minHeight: sizes.standardControl,
  },
  screen: {
    backgroundColor: colors.canvas,
  },
  screenContent: {
    backgroundColor: colors.canvas,
  },
  submit: {
    borderRadius: radii.md,
    marginTop: spacing['2xl'],
    minHeight: sizes.actionControl,
  },
});
