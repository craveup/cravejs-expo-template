import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import {
  MerchantLocationHeader,
  type MerchantLocationHeaderState,
  PresentationIcon,
} from '@/features/_shared';
import {
  createTranslator,
  getLocaleDirection,
  type AppLocale,
  type TranslationKey,
} from '@/i18n';
import { getResponsiveLayout } from '@/layout';
import { colors, radii, sizes, spacing } from '@/theme';

import {
  getAccountRowIconName,
  getProfileInitials,
  getVisibleAccountRows,
  type AccountRowId,
} from './account-home';

export type AccountProfilePresentation = Readonly<{
  displayName?: string;
  email?: string;
  phone?: string;
}>;

export type LoyaltyPresentation = Readonly<{
  balanceLabel: string;
}>;

export type SavedStorePresentation = Readonly<{
  address?: string;
  name: string;
}>;

export type AccountHomeScreenProps = Readonly<{
  error?: boolean;
  loading?: boolean;
  locale?: AppLocale;
  loyalty?: LoyaltyPresentation;
  merchantHeaderState: MerchantLocationHeaderState;
  onHelp?: () => void;
  onLogout?: () => void;
  onMerchantHeaderRetry?: () => void;
  onOrderHistory?: () => void;
  onRetry?: () => void;
  onSavedStores?: () => void;
  profile?: AccountProfilePresentation;
  savedStore?: SavedStorePresentation;
}>;

const rowTranslationKeys: Record<AccountRowId, TranslationKey> = {
  help: 'account.action.help',
  orderHistory: 'account.action.orderHistory',
  savedStores: 'account.action.savedStores',
};

export function AccountHomeScreen({
  error = false,
  loading = false,
  locale = 'en',
  loyalty,
  merchantHeaderState,
  onHelp,
  onLogout,
  onMerchantHeaderRetry,
  onOrderHistory,
  onRetry,
  onSavedStores,
  profile,
  savedStore,
}: AccountHomeScreenProps) {
  const t = createTranslator(locale);
  const direction = getLocaleDirection(locale);
  const rowDirection = direction === 'rtl' ? 'row-reverse' : 'row';
  const rowIconName = getAccountRowIconName(direction);
  const { fontScale, width } = useWindowDimensions();
  const layout = getResponsiveLayout(width, fontScale);
  const actions: Partial<Record<AccountRowId, () => void>> = {
    help: onHelp,
    orderHistory: onOrderHistory,
    savedStores: onSavedStores,
  };
  const rows = getVisibleAccountRows({
    help: Boolean(onHelp),
    orderHistory: Boolean(onOrderHistory),
    savedStores: Boolean(onSavedStores),
  });
  const profileInitials = getProfileInitials(profile?.displayName);

  return (
    <Screen
      accessibilityLabel={t('account.screen')}
      background="contentCanvas"
      contentContainerStyle={[
        styles.content,
        {
          direction,
          maxWidth: layout.contentMaxWidth,
          paddingHorizontal: layout.horizontalPadding,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      padded={false}
      scrollable
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerSurface}>
        <MerchantLocationHeader locale={locale} state={merchantHeaderState} />
      </View>

      {merchantHeaderState.status === 'unavailable' && onMerchantHeaderRetry ? (
        <Button
          label={t('account.action.retryLocation')}
          onPress={onMerchantHeaderRetry}
          variant="ghost"
        />
      ) : null}

      {loading ? (
        <View accessibilityLiveRegion="polite" style={styles.state}>
          <ActivityIndicator color={colors.accent} />
          <AppText color="textMuted">{t('account.loading')}</AppText>
        </View>
      ) : error ? (
        <Surface accessibilityLiveRegion="polite" style={styles.messageCard}>
          <AppText color="danger" variant="bodyStrong">
            {t('account.error')}
          </AppText>
          {onRetry ? (
            <Button
              label={t('action.retry')}
              onPress={onRetry}
              variant="secondary"
            />
          ) : null}
        </Surface>
      ) : profile ? (
        <>
          <View style={[styles.profileCard, { flexDirection: rowDirection }]}>
            <View style={styles.avatar}>
              {profileInitials ? (
                <AppText align="center" style={styles.avatarText} variant="subheading">
                  {profileInitials}
                </AppText>
              ) : (
                <PresentationIcon color={colors.surface} name="person" size={24} />
              )}
            </View>
            <View style={styles.profileCopy}>
              {profile.displayName ? (
                <AppText numberOfLines={2} variant="subheading">
                  {profile.displayName}
                </AppText>
              ) : null}
              {profile.phone ? (
                <AppText color="textMuted" numberOfLines={1}>
                  {profile.phone}
                </AppText>
              ) : null}
              {profile.email ? (
                <AppText color="textMuted" numberOfLines={1}>
                  {profile.email}
                </AppText>
              ) : null}
            </View>
          </View>

          {loyalty ? (
            <Surface
              accessibilityLabel={t('account.balanceAccessibility', {
                balance: loyalty.balanceLabel,
                club: t('account.club'),
              })}
              accessibilityRole="summary"
              accessible
              background="accent"
              bordered={false}
              radius="action"
              style={styles.loyaltyCard}
            >
              <AppText style={styles.loyaltyEyebrow} variant="label">
                {t('account.club')}
              </AppText>
              <AppText style={styles.loyaltyBalance} variant="title">
                {loyalty.balanceLabel}
              </AppText>
            </Surface>
          ) : null}

          {savedStore && !onSavedStores ? (
            <Surface
              bordered={false}
              radius="md"
              style={[styles.storeCard, { flexDirection: rowDirection }]}
            >
              <View style={styles.leadingIcon}>
                <PresentationIcon color={colors.accent} name="store" size={20} />
              </View>
              <View style={styles.rowCopy}>
                <AppText variant="bodyStrong">{savedStore.name}</AppText>
                {savedStore.address ? (
                  <AppText color="textMuted" numberOfLines={2} variant="caption">
                    {savedStore.address}
                  </AppText>
                ) : null}
              </View>
            </Surface>
          ) : null}

          {rows.length > 0 ? (
            <View accessibilityRole="list" style={styles.rowsList}>
              {rows.map((row) => {
                const label = t(rowTranslationKeys[row]);
                const summary = row === 'savedStores' ? savedStore?.name : undefined;
                return (
                  <Pressable
                    accessibilityLabel={summary ? `${label}, ${summary}` : label}
                    accessibilityRole="button"
                    key={row}
                    onPress={actions[row]}
                    style={({ pressed }) => [
                      styles.row,
                      { flexDirection: rowDirection },
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText numberOfLines={2} style={styles.rowLabel} variant="bodyStrong">
                      {label}
                    </AppText>
                    {summary ? (
                      <AppText
                        color="textMuted"
                        numberOfLines={1}
                        style={styles.rowSummary}
                        variant="caption"
                      >
                        {summary}
                      </AppText>
                    ) : null}
                    <PresentationIcon color={colors.iconMuted} name={rowIconName} size={18} />
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {onLogout ? (
            <Pressable
              accessibilityLabel={t('account.action.signOut')}
              accessibilityRole="button"
              onPress={onLogout}
              style={({ pressed }) => [
                styles.row,
                { flexDirection: rowDirection },
                pressed && styles.pressed,
              ]}
            >
              <AppText color="danger" style={styles.rowLabel} variant="bodyMedium">
                {t('account.action.signOut')}
              </AppText>
              <PresentationIcon color={colors.iconMuted} name={rowIconName} size={18} />
            </Pressable>
          ) : null}
        </>
      ) : (
        <Surface accessibilityLiveRegion="polite" style={styles.messageCard}>
          <AppText color="textMuted">{t('account.unavailable')}</AppText>
        </Surface>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: {
    color: colors.surface,
  },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.xl,
    paddingBottom: spacing['7xl'],
    paddingTop: spacing['4xl'],
    width: '100%',
  },
  headerSurface: {
    backgroundColor: colors.canvas,
    borderRadius: radii.card,
    paddingHorizontal: spacing['4xl'],
    paddingVertical: spacing['3xl'],
  },
  leadingIcon: {
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  loyaltyBalance: {
    color: colors.surface,
    marginTop: spacing.sm,
  },
  loyaltyCard: {
    paddingHorizontal: spacing['4xl'],
    paddingVertical: spacing['3xl'],
  },
  loyaltyEyebrow: {
    color: colors.surface,
  },
  messageCard: {
    gap: spacing['3xl'],
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.82,
  },
  profileCard: {
    alignItems: 'center',
    gap: spacing['3xl'],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  profileCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    gap: spacing.xl,
    minHeight: sizes.minimumTouchTarget,
    paddingHorizontal: spacing['4xl'],
    paddingVertical: spacing.xl,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  rowLabel: {
    flex: 1,
  },
  rowSummary: {
    maxWidth: '45%',
  },
  rowsList: {
    gap: spacing.md,
  },
  state: {
    alignItems: 'center',
    gap: spacing.xl,
    paddingVertical: spacing['7xl'],
  },
  storeCard: {
    alignItems: 'center',
    gap: spacing.xl,
  },
});
