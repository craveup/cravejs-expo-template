import { useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import {
  MerchantLocationHeader,
  type MerchantLocationHeaderState,
} from '@/features/_shared';
import { colors, sizes, spacing, textStyles } from '@/theme';

import {
  filterLocations,
  getLocationPickerSectionLabel,
  getLocationPickerState,
  type LocationPickerItem,
} from './location-picker';

export type LocationPickerScreenProps = {
  errorMessage?: string;
  loading?: boolean;
  locations: readonly LocationPickerItem[];
  merchantHeaderState: MerchantLocationHeaderState;
  onOpenAccount?: () => void;
  onQueryChange: (query: string) => void;
  onRetry?: () => void;
  onSelect: (location: LocationPickerItem) => void;
  query: string;
  selectedLocationId?: string;
};

export function LocationPickerScreen({
  errorMessage,
  loading = false,
  locations,
  merchantHeaderState,
  onOpenAccount,
  onQueryChange,
  onRetry,
  onSelect,
  query,
  selectedLocationId,
}: LocationPickerScreenProps) {
  const filteredLocations = useMemo(() => filterLocations(locations, query), [locations, query]);
  const state = getLocationPickerState(filteredLocations.length, loading, errorMessage);

  return (
    <Screen
      accessibilityLabel="Pickup location picker"
      background="contentCanvas"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      padded={false}
      scrollable
    >
      <MerchantLocationHeader
        onOpenAccount={onOpenAccount}
        state={merchantHeaderState}
      />

      <View style={styles.intro}>
        <AppText variant="heading">Where are you picking up?</AppText>
      </View>

      <Surface bordered={false} padding="none" radius="md" style={styles.searchField}>
        <TextInput
          accessibilityLabel="Search stores"
          autoCapitalize="words"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onQueryChange}
          placeholder="Search by address or store"
          placeholderTextColor={colors.iconMuted}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
      </Surface>

      {state === 'loading' ? (
        <Surface accessibilityLiveRegion="polite" style={styles.stateCard}>
          <AppText color="textMuted">Finding stores…</AppText>
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
          <AppText variant="bodyStrong">No stores found</AppText>
          <AppText color="textMuted">Try a different store name or address.</AppText>
        </Surface>
      ) : (
        <View style={styles.resultsSection}>
          <AppText color="textSubtle" variant="label">
            {getLocationPickerSectionLabel(filteredLocations)}
          </AppText>
          <View accessibilityRole="list" style={styles.results}>
            {filteredLocations.map((location) => {
              const selected = selectedLocationId === location.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  aria-pressed={selected}
                  key={location.id}
                  onPress={() => onSelect(location)}
                >
                  {({ pressed }) => (
                    <Surface
                      bordered={false}
                      padding="none"
                      style={[
                        styles.locationCard,
                        selected && styles.locationCardSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.locationCopy}>
                        <View style={styles.locationHeading}>
                          <AppText style={styles.locationName} variant="bodyStrong">
                            {location.name}
                          </AppText>
                          {selected ? (
                            <AppText color="accent" variant="label">
                              SELECTED
                            </AppText>
                          ) : location.distanceLabel ? (
                            <AppText color="textSubtle" variant="caption">
                              {location.distanceLabel}
                            </AppText>
                          ) : null}
                        </View>
                        <AppText color="textMuted" variant="caption">
                          {location.address}
                        </AppText>
                      </View>
                    </Surface>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing['7xl'],
    paddingHorizontal: spacing['5xl'],
    paddingTop: spacing['4xl'],
  },
  intro: {
    gap: spacing.md,
    marginTop: spacing['4xl'],
  },
  locationCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xl,
    minHeight: 78,
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing['2xl'],
  },
  locationCardSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  locationCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  locationHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  locationName: {
    flex: 1,
  },
  pressed: {
    opacity: 0.78,
  },
  results: {
    gap: spacing.xl,
  },
  resultsSection: {
    gap: spacing['2xl'],
    marginTop: spacing['3xl'],
  },
  searchField: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: spacing.xl,
    minHeight: sizes.minimumTouchTarget,
    paddingHorizontal: spacing['3xl'],
  },
  searchInput: {
    ...textStyles.bodyMedium,
    color: colors.ink,
    flex: 1,
    minHeight: sizes.minimumTouchTarget,
    paddingVertical: spacing.md,
  },
  stateCard: {
    gap: spacing['3xl'],
    marginTop: spacing['5xl'],
    minHeight: sizes.standardControl * 2,
    justifyContent: 'center',
  },
});
