import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import {
  MerchantLocationHeader,
  type MerchantLocationHeaderState,
} from '@/features/_shared';
import { colors, radii, sizes, spacing } from '@/theme';

import { PresentationIcon } from '../_shared/PresentationIcon';
import { getFulfillmentSummary, getStoreDetailActions } from './store-detail';

export type StoreDetailScreenProps = {
  address: string;
  distanceLabel?: string;
  fulfillmentMethodLabels: readonly string[];
  mapSlot?: ReactNode;
  merchantHeaderState: MerchantLocationHeaderState;
  name: string;
  onDirections?: () => void;
  onOpenAccount?: () => void;
  onSelectStore: () => void;
  onShare?: () => void;
  selectionDisabled?: boolean;
  selectionPending?: boolean;
};

export function StoreDetailScreen({
  address,
  distanceLabel,
  fulfillmentMethodLabels,
  mapSlot,
  merchantHeaderState,
  name,
  onDirections,
  onOpenAccount,
  onSelectStore,
  onShare,
  selectionDisabled = false,
  selectionPending = false,
}: StoreDetailScreenProps) {
  const actions = getStoreDetailActions({
    canGetDirections: Boolean(onDirections),
    canShare: Boolean(onShare),
  });
  const actionCallbacks = { directions: onDirections, share: onShare };

  return (
    <Screen
      accessibilityLabel="Store details"
      background="contentCanvas"
      contentContainerStyle={styles.content}
      padded={false}
      scrollable
    >
      <MerchantLocationHeader
        onOpenAccount={onOpenAccount}
        state={merchantHeaderState}
      />

      {mapSlot ? <View style={styles.mapSlot}>{mapSlot}</View> : null}

      <View style={styles.details}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <AppText variant="heading">{name}</AppText>
            <AppText color="textMuted">
              {address}
              {distanceLabel ? ` · ${distanceLabel}` : ''}
            </AppText>
          </View>
        </View>

        {fulfillmentMethodLabels.length > 0 ? (
          <Surface bordered={false} style={styles.methodCard}>
            <View style={styles.methodIcon}>
              <PresentationIcon color={colors.accent} name="store" size={21} />
            </View>
            <View style={styles.methodCopy}>
              <AppText color="textMuted" variant="caption">
                Available here
              </AppText>
              <AppText variant="bodyStrong">
                {getFulfillmentSummary(fulfillmentMethodLabels)}
              </AppText>
            </View>
          </Surface>
        ) : null}

        {actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                accessibilityRole="button"
                key={action}
                onPress={actionCallbacks[action]}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <AppText variant="bodyStrong">
                  {action === 'directions' ? 'Directions' : 'Share'}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Button
          accessibilityHint={
            selectionDisabled
              ? 'Ordering is configured for another store.'
              : 'Browse the menu for this store.'
          }
          disabled={selectionDisabled}
          label="Order from this store"
          loading={selectionPending}
          onPress={onSelectStore}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.action,
    flex: 1,
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    padding: spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  content: {
    gap: spacing.xl,
    minHeight: '100%',
    paddingBottom: spacing['7xl'],
    paddingHorizontal: spacing['5xl'],
    paddingTop: spacing['4xl'],
  },
  details: {
    gap: spacing.xl,
  },
  headingCopy: {
    flex: 1,
    gap: spacing.md,
  },
  headingRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xl,
  },
  mapSlot: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.action,
    marginTop: spacing.sm,
    minHeight: 150,
    overflow: 'hidden',
  },
  methodCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xl,
  },
  methodCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  methodIcon: {
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pressed: {
    opacity: 0.7,
  },
});
