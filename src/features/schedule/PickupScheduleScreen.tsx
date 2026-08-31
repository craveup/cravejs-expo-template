import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import {
  MerchantLocationHeader,
  type MerchantLocationHeaderState,
} from '@/features/_shared';
import { colors, radii, sizes, spacing } from '@/theme';

import { PresentationIcon } from '../_shared/PresentationIcon';
import {
  buildAsapScheduleSelection,
  buildScheduleSelection,
  getScheduleActionLabel,
  getIntervalsForDay,
  isScheduleSelectionValid,
  shouldChangeScheduleValue,
  type PickupDayPresentation,
  type PickupScheduleSelection,
} from './pickup-schedule';

export type PickupScheduleScreenProps = {
  allowAsap: boolean;
  asapSelected: boolean;
  days: readonly PickupDayPresentation[];
  errorMessage?: string;
  merchantHeaderState: MerchantLocationHeaderState;
  onAsapSelect: () => void;
  onDayChange: (dayValue: string) => void;
  onIntervalChange: (intervalValue: string) => void;
  onOpenAccount?: () => void;
  onSchedule: (selection: PickupScheduleSelection) => void;
  pending?: boolean;
  selectedDayValue: string;
  selectedIntervalValue: string;
  storeName?: string;
};

export function PickupScheduleScreen({
  allowAsap,
  asapSelected,
  days,
  errorMessage,
  merchantHeaderState,
  onAsapSelect,
  onDayChange,
  onIntervalChange,
  onOpenAccount,
  onSchedule,
  pending = false,
  selectedDayValue,
  selectedIntervalValue,
  storeName,
}: PickupScheduleScreenProps) {
  const intervals = useMemo(
    () => getIntervalsForDay(days, selectedDayValue),
    [days, selectedDayValue],
  );
  const selection = asapSelected
    ? buildAsapScheduleSelection()
    : buildScheduleSelection(selectedDayValue, selectedIntervalValue);
  const canSchedule =
    isScheduleSelectionValid(days, selection, allowAsap) && !pending;

  return (
    <Screen
      accessibilityLabel="Pickup schedule"
      background="contentCanvas"
      contentContainerStyle={styles.content}
      padded={false}
      scrollable
      style={styles.screen}
    >
      <MerchantLocationHeader
        onOpenAccount={onOpenAccount}
        state={merchantHeaderState}
      />

      <View style={styles.heading}>
        <AppText variant="heading">When do you want it?</AppText>
      </View>

      {days.length > 0 ? (
        <>
          <View style={styles.section}>
            <ScrollView
              contentContainerStyle={styles.dayList}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {days.map((day) => {
                const selected = day.value === selectedDayValue;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: pending, selected }}
                    aria-disabled={pending}
                    aria-pressed={selected}
                    disabled={pending}
                    key={day.value}
                    onPress={() => {
                      if (
                        asapSelected ||
                        shouldChangeScheduleValue(selectedDayValue, day.value)
                      ) {
                        onDayChange(day.value);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.day,
                      selected && styles.daySelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText
                      align="center"
                      color={selected ? 'surface' : 'ink'}
                      variant="caption"
                    >
                      {day.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {storeName ? (
            <AppText color="textMuted" style={styles.storeLabel} variant="label">
              {storeName}
            </AppText>
          ) : null}

          <View style={styles.section}>
            {intervals.length > 0 ? (
              <View accessibilityRole="radiogroup" style={styles.intervalGrid}>
                {allowAsap ? (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: asapSelected,
                      disabled: pending,
                    }}
                    aria-checked={asapSelected}
                    aria-disabled={pending}
                    disabled={pending}
                    onPress={() => {
                      if (!asapSelected) onAsapSelect();
                    }}
                    style={({ pressed }) => [
                      styles.interval,
                      asapSelected && styles.intervalSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText
                      color="ink"
                      style={styles.intervalLabel}
                      variant="bodyStrong"
                    >
                      As soon as possible
                    </AppText>
                    {asapSelected ? (
                      <PresentationIcon color={colors.accent} name="check" size={20} />
                    ) : null}
                  </Pressable>
                ) : null}
                {intervals.map((interval) => {
                  const selected =
                    !asapSelected && interval.value === selectedIntervalValue;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: pending }}
                      aria-checked={selected}
                      aria-disabled={pending}
                      disabled={pending}
                      key={interval.value}
                      onPress={() => {
                        if (
                          asapSelected ||
                          shouldChangeScheduleValue(
                            selectedIntervalValue,
                            interval.value,
                          )
                        ) {
                          onIntervalChange(interval.value);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.interval,
                        selected && styles.intervalSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <AppText
                        align="center"
                        color="ink"
                        style={styles.intervalLabel}
                        variant="bodyStrong"
                      >
                        {interval.label}
                      </AppText>
                      {selected ? (
                        <PresentationIcon color={colors.accent} name="check" size={20} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Surface accessibilityLiveRegion="polite">
                <AppText color="textMuted">No pickup times are available for this day.</AppText>
              </Surface>
            )}
          </View>
        </>
      ) : (
        <Surface accessibilityLiveRegion="polite">
          <AppText color="textMuted">No pickup days are available.</AppText>
        </Surface>
      )}

      {errorMessage ? (
        <AppText accessibilityLiveRegion="polite" color="danger" variant="caption">
          {errorMessage}
        </AppText>
      ) : null}

      <Button
        disabled={!canSchedule}
        label={getScheduleActionLabel(days, selection)}
        loading={pending}
        onPress={() => onSchedule(selection)}
        style={styles.submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.contentCanvas,
    gap: spacing.xl,
    minHeight: '100%',
    paddingBottom: spacing['7xl'],
    paddingHorizontal: spacing['5xl'],
    paddingTop: spacing['4xl'],
  },
  day: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    minWidth: 64,
    paddingHorizontal: spacing['2xl'],
  },
  dayList: {
    gap: spacing.md,
    paddingRight: spacing['5xl'],
  },
  daySelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  heading: {
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  interval: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    paddingHorizontal: spacing['3xl'],
    width: '100%',
  },
  intervalLabel: {
    flex: 1,
  },
  intervalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xl,
  },
  intervalSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.76,
  },
  screen: {
    backgroundColor: colors.canvas,
  },
  section: {
    gap: spacing['3xl'],
  },
  submit: {
    marginTop: 'auto',
    minHeight: sizes.actionControl,
  },
  storeLabel: {
    textTransform: 'uppercase',
  },
});
