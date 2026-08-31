import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { getStoreClosedPresentation } from './store-closed';

export type StoreClosedScreenProps = {
  nextOrderingSlotLabel?: string;
  onFindAnotherStore: () => void;
  onScheduleLater?: () => void;
  storeName: string;
};

export function StoreClosedScreen({
  nextOrderingSlotLabel,
  onFindAnotherStore,
  onScheduleLater,
  storeName,
}: StoreClosedScreenProps) {
  const presentation = getStoreClosedPresentation(
    storeName,
    nextOrderingSlotLabel,
  );

  return (
    <Screen
      accessibilityLabel="Store closed"
      contentContainerStyle={styles.content}
      padded={false}
      scrollable
      style={styles.screen}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.mark}
      >
        <AppText align="center" style={styles.markText}>
          🌙
        </AppText>
      </View>

      <View style={styles.heading}>
        <AppText align="center" style={styles.headingText} variant="title">
          {presentation.storeName} is closed
        </AppText>
        <AppText align="center" color="textMuted" style={styles.supportingCopy}>
          {presentation.supportingCopy}
        </AppText>
      </View>

      {presentation.nextOrderingSlotLabel ? (
        <Surface
          bordered={false}
          padding="none"
          radius="action"
          style={styles.slotCard}
        >
          <View style={styles.slotCopy}>
            <AppText color="textSubtle" variant="label">
              NEXT ORDERING TIME
            </AppText>
            <AppText variant="bodyStrong">
              {presentation.nextOrderingSlotLabel}
            </AppText>
          </View>
        </Surface>
      ) : null}

      <View
        style={[
          styles.actions,
          presentation.nextOrderingSlotLabel && styles.actionsAfterSlot,
        ]}
      >
        {presentation.nextOrderingSlotLabel && onScheduleLater ? (
          <Button label="Schedule for later" onPress={onScheduleLater} />
        ) : null}
        <Button
          label="Find another store"
          onPress={onFindAnotherStore}
          variant="secondary"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing['2xl'],
  },
  actionsAfterSlot: {
    marginTop: spacing['2xl'] + spacing.md,
  },
  content: {
    backgroundColor: colors.canvas,
    flexGrow: 1,
    gap: spacing['2xl'],
    paddingBottom: spacing['7xl'],
    paddingHorizontal: spacing['6xl'],
    paddingTop: 100,
  },
  heading: {
    alignSelf: 'center',
    gap: spacing['2xl'],
    maxWidth: 290,
  },
  headingText: {
    fontSize: 22,
    letterSpacing: 0,
    lineHeight: 28,
  },
  mark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  markText: {
    fontSize: 34,
    lineHeight: 41,
  },
  screen: {
    backgroundColor: colors.canvas,
  },
  slotCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xl,
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing['2xl'],
  },
  slotCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  supportingCopy: {
    fontSize: 13,
    lineHeight: 16,
  },
});
