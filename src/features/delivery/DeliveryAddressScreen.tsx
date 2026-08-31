import { useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import {
  MerchantLocationHeader,
  type MerchantLocationHeaderState,
} from '@/features/_shared';
import { colors, fontFamilies, radii, sizes, spacing, textStyles } from '@/theme';

import { PresentationIcon } from '../_shared/PresentationIcon';
import {
  getAddressEntryState,
  getCurrentLocationActionState,
  type AddressCandidatePresentation,
  type LocationPermissionPresentation,
} from './address-entry';

export type DeliveryAddressScreenProps = {
  candidates: readonly AddressCandidatePresentation[];
  errorMessage?: string;
  loading?: boolean;
  locationPermissionState?: LocationPermissionPresentation;
  merchantHeaderState: MerchantLocationHeaderState;
  onOpenAccount?: () => void;
  onQueryChange: (query: string) => void;
  onRetry?: () => void;
  onSelectCandidate: (candidate: AddressCandidatePresentation) => void;
  onSubmitQuery?: () => void;
  onUseCurrentLocation?: () => void;
  query: string;
  selectedCandidateId?: string;
  usingCurrentLocation?: boolean;
};

export function DeliveryAddressScreen({
  candidates,
  errorMessage,
  loading = false,
  locationPermissionState,
  merchantHeaderState,
  onOpenAccount,
  onQueryChange,
  onRetry,
  onSelectCandidate,
  onSubmitQuery,
  onUseCurrentLocation,
  query,
  selectedCandidateId,
  usingCurrentLocation = false,
}: DeliveryAddressScreenProps) {
  const state = useMemo(
    () => getAddressEntryState(query, candidates.length, loading, errorMessage),
    [candidates.length, errorMessage, loading, query],
  );
  const currentLocationState = getCurrentLocationActionState(
    Boolean(onUseCurrentLocation),
    locationPermissionState,
  );

  return (
    <Screen
      accessibilityLabel="Delivery address entry"
      background="contentCanvas"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      padded={false}
      scrollable
      style={styles.screen}
    >
      <MerchantLocationHeader
        onOpenAccount={onOpenAccount}
        state={merchantHeaderState}
      />

      <View style={styles.intro}>
        <AppText variant="heading">Where are we bringing it?</AppText>
      </View>

      <Surface padding="none" radius="md" style={styles.searchField}>
        <TextInput
          accessibilityLabel="Search for an address"
          autoCapitalize="words"
          autoComplete="street-address"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onQueryChange}
          onSubmitEditing={onSubmitQuery}
          placeholder="Search for an address"
          placeholderTextColor={colors.iconMuted}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
      </Surface>

      {state === 'loading' ? (
        <Surface accessibilityLiveRegion="polite" style={styles.stateCard}>
          <AppText color="textMuted">Searching addresses…</AppText>
        </Surface>
      ) : state === 'error' ? (
        <Surface accessibilityLiveRegion="polite" style={styles.stateCard}>
          <AppText color="danger" variant="bodyStrong">
            {errorMessage}
          </AppText>
          {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" /> : null}
        </Surface>
      ) : state === 'empty' ? (
        <Surface accessibilityLiveRegion="polite" style={styles.stateCard}>
          <AppText variant="bodyStrong">No address candidates found</AppText>
          <AppText color="textMuted">Check the spelling or try a more specific search.</AppText>
        </Surface>
      ) : state === 'results' ? (
        <View
          accessibilityLabel="Address candidates"
          accessibilityRole="list"
          style={styles.results}
        >
          <AppText color="textMuted" style={styles.sectionLabel} variant="label">
            SUGGESTIONS
          </AppText>
          <View style={styles.candidateList}>
            {candidates.map((candidate) => {
              const selected = candidate.id === selectedCandidateId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  aria-pressed={selected}
                  key={candidate.id}
                  onPress={() => onSelectCandidate(candidate)}
                >
                  {({ pressed }) => (
                    <Surface
                      bordered={false}
                      padding="none"
                      radius="action"
                      style={[
                        styles.candidate,
                        selected && styles.candidateSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.candidateCopy}>
                        <AppText variant="bodyMedium">{candidate.primaryLabel}</AppText>
                        {candidate.secondaryLabel ? (
                          <AppText color="textSubtle" variant="micro">
                            {candidate.secondaryLabel}
                          </AppText>
                        ) : null}
                      </View>
                    </Surface>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <Surface style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <PresentationIcon color={colors.accent} name="location" size={20} />
          </View>
          <AppText color="textMuted" style={styles.tipCopy} variant="caption">
            Select a complete address from the candidate list.
          </AppText>
        </Surface>
      )}

      {currentLocationState !== 'hidden' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            busy: usingCurrentLocation,
            disabled: currentLocationState === 'disabled' || usingCurrentLocation,
          }}
          disabled={currentLocationState === 'disabled' || usingCurrentLocation}
          onPress={onUseCurrentLocation}
          style={({ pressed }) => [styles.currentLocation, pressed && styles.pressed]}
        >
          <AppText color="accent" style={styles.currentLocationLabel} variant="caption">
            {usingCurrentLocation ? 'Finding your location…' : 'Use my current location'}
          </AppText>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  candidate: {
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing['2xl'],
  },
  candidateList: {
    gap: spacing.xl,
  },
  candidateCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  candidateSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  content: {
    backgroundColor: colors.contentCanvas,
    gap: spacing.xl,
    minHeight: '100%',
    paddingBottom: spacing['7xl'],
    paddingHorizontal: spacing['5xl'],
    paddingTop: spacing['4xl'],
  },
  intro: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  currentLocation: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
  },
  currentLocationLabel: {
    fontFamily: fontFamilies.bodySemiBold,
  },
  pressed: {
    opacity: 0.74,
  },
  results: {
    gap: spacing.md,
  },
  sectionLabel: {
    letterSpacing: 1.2,
  },
  screen: {
    backgroundColor: colors.canvas,
  },
  searchField: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderWidth: 2,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: spacing['3xl'],
  },
  searchInput: {
    ...textStyles.bodyMedium,
    color: colors.ink,
    flex: 1,
    minHeight: 50,
    paddingVertical: spacing.xl,
  },
  stateCard: {
    gap: spacing['3xl'],
  },
  tipCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xl,
  },
  tipCopy: {
    flex: 1,
  },
  tipIcon: {
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
});
