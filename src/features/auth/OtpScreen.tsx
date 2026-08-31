import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, Button, IconButton, Screen, Surface } from '@/components/ui';
import { colors, radii, sizes, spacing, textStyles } from '@/theme';

import { PresentationIcon } from '../_shared/PresentationIcon';
import {
  acceptsOtpInput,
  getOtpPresentationState,
  OTP_LENGTH,
} from './otp';

export type OtpScreenProps = {
  countdownLabel?: string;
  errorMessage?: string;
  identifierLabel: string;
  onBack: () => void;
  onCodeChange?: (code: string) => void;
  onResend: () => void;
  onSubmit: (code: string) => void;
  pending?: boolean;
  resendAvailable: boolean;
};

export function OtpScreen({
  countdownLabel,
  errorMessage,
  identifierLabel,
  onBack,
  onCodeChange,
  onResend,
  onSubmit,
  pending = false,
  resendAvailable,
}: OtpScreenProps) {
  const [code, setCode] = useState('');
  const inputRef = useRef<TextInput>(null);
  const state = useMemo(
    () => getOtpPresentationState(code, pending, resendAvailable, errorMessage),
    [code, errorMessage, pending, resendAvailable],
  );

  const updateCode = (nextCode: string) => {
    if (!acceptsOtpInput(nextCode)) return;
    setCode(nextCode);
    onCodeChange?.(nextCode);
  };

  return (
    <Screen
      accessibilityLabel="Verify sign-in code"
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
              VERIFY
            </AppText>
            <AppText variant="title">Enter the 6-digit code</AppText>
            <AppText color="textMuted" variant="body">
              Sent to {identifierLabel}
            </AppText>
          </View>

          <Pressable
            accessibilityRole="none"
            onPress={() => inputRef.current?.focus()}
            style={styles.codeArea}
          >
            <View style={[styles.cells, styles.nonInteractive]}>
              {Array.from({ length: OTP_LENGTH }, (_, index) => {
                const digit = code[index] ?? '';
                const isEntered = index < code.length;
                const isCurrent = index === Math.min(code.length, OTP_LENGTH - 1);
                return (
                  <Surface
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    key={index}
                    padding="none"
                    radius="md"
                    style={[
                      styles.cell,
                      (isEntered || isCurrent) && styles.cellActive,
                      state.hasError && styles.cellError,
                    ]}
                  >
                    <AppText align="center" style={styles.digit} variant="title">
                      {digit}
                    </AppText>
                  </Surface>
                );
              })}
            </View>
            <TextInput
              ref={inputRef}
              accessibilityHint="Enter the six digit code sent to you"
              accessibilityLabel="Six digit sign-in code"
              autoComplete="one-time-code"
              autoFocus
              caretHidden
              contextMenuHidden={false}
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              onChangeText={updateCode}
              onSubmitEditing={() => {
                if (state.canSubmit) onSubmit(code);
              }}
              returnKeyType="done"
              style={styles.hiddenInput}
              textContentType="oneTimeCode"
              value={code}
            />
          </Pressable>

          {errorMessage ? (
            <AppText accessibilityLiveRegion="polite" align="center" color="danger" variant="caption">
              {errorMessage}
            </AppText>
          ) : null}

          <View style={styles.resendRow}>
            <AppText color="textMuted" variant="bodyMedium">
              Didn&apos;t get it?
            </AppText>
            <Pressable
              accessibilityRole="button"
              disabled={!state.canResend}
              hitSlop={10}
              onPress={onResend}
            >
              <AppText
                color={state.canResend ? 'ink' : 'textSubtle'}
                style={styles.resendLabel}
                variant="bodyStrong"
              >
                {state.canResend ? 'Resend code' : (countdownLabel ?? 'Resend unavailable')}
              </AppText>
            </Pressable>
          </View>

          <Button
            disabled={!state.canSubmit}
            label="Continue"
            loading={pending}
            onPress={() => onSubmit(code)}
            style={styles.submit}
            variant="dark"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
  },
  cell: {
    alignItems: 'center',
    aspectRatio: 0.86,
    flexBasis: '13.5%',
    flexGrow: 0,
    justifyContent: 'center',
    maxWidth: 52,
    minHeight: sizes.minimumTouchTarget,
  },
  cellActive: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  cellError: {
    borderColor: colors.danger,
  },
  cells: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
    width: '100%',
  },
  codeArea: {
    marginTop: spacing['4xl'],
    position: 'relative',
  },
  content: {
    flex: 1,
    paddingBottom: spacing['6xl'],
    paddingHorizontal: spacing['6xl'],
    paddingTop: spacing['5xl'],
  },
  digit: {
    fontSize: 26,
    lineHeight: 30,
  },
  hiddenInput: {
    ...textStyles.body,
    height: 1,
    opacity: 0.01,
    position: 'absolute',
    width: 1,
  },
  intro: {
    gap: spacing.xl,
    marginTop: spacing['7xl'],
    maxWidth: 320,
  },
  keyboardView: {
    flex: 1,
  },
  nonInteractive: {
    pointerEvents: 'none',
  },
  resendLabel: {
    textDecorationLine: 'underline',
  },
  resendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
    marginTop: spacing['2xl'],
    minHeight: sizes.minimumTouchTarget,
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
