import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import {
  getNoPublishedLocationsSupportingCopy,
  getNoPublishedLocationsTitle,
} from './no-nearby-stores';

export type NoNearbyStoresScreenProps = {
  onBrowseMenu: () => void;
};

export function NoNearbyStoresScreen({ onBrowseMenu }: NoNearbyStoresScreenProps) {
  return (
    <Screen
      accessibilityLabel="No pickup shops available"
      contentContainerStyle={styles.content}
      padded={false}
      scrollable
      style={styles.screen}
    >
      <View style={styles.mark}>
        <AppText align="center" style={styles.markText}>
          📍
        </AppText>
      </View>

      <View style={styles.heading}>
        <AppText align="center" variant="title">
          {getNoPublishedLocationsTitle()}
        </AppText>
        <AppText align="center" color="textMuted">
          {getNoPublishedLocationsSupportingCopy()}
        </AppText>
      </View>

      <View style={styles.spacer} />
      <Button label="Browse the menu anyway" onPress={onBrowseMenu} style={styles.browseButton} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  browseButton: {
    marginTop: spacing['2xl'],
    minHeight: 48,
  },
  content: {
    alignItems: 'stretch',
    backgroundColor: colors.canvas,
    flexGrow: 1,
    paddingBottom: spacing['7xl'],
    paddingHorizontal: spacing['6xl'],
    paddingTop: 100,
  },
  heading: {
    alignSelf: 'center',
    gap: spacing['2xl'],
    marginTop: spacing['2xl'],
    maxWidth: 290,
  },
  mark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.imageSurface,
    borderRadius: radii.pill,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  markText: {
    fontSize: 36,
    lineHeight: 44,
  },
  screen: {
    backgroundColor: colors.canvas,
  },
  spacer: {
    height: spacing['7xl'] * 4 + spacing.md,
    marginTop: spacing['2xl'],
  },
});
