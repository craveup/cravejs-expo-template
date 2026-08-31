import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, Surface } from '@/components/ui';
import {
  MerchantLocationHeader,
  type MerchantLocationHeaderState,
} from '@/features/_shared';
import { colors, fontFamilies, sizes, spacing } from '@/theme';

import {
  getDeliveryChoicePresentation,
  getFulfillmentChoiceViewState,
  getSelectableFulfillmentChoice,
  type FulfillmentPresentationChoice,
  type PickupLocationPresentation,
} from './fulfillment-choice';

export type FulfillmentChoiceScreenProps = {
  deliveryEntryEnabled: boolean;
  deliveryUnavailableCopy?: string;
  errorMessage?: string;
  merchantHeaderState: MerchantLocationHeaderState;
  onContinue: (choice: FulfillmentPresentationChoice) => void;
  onOpenAccount?: () => void;
  onSelectChoice: (choice: FulfillmentPresentationChoice) => void;
  pending?: boolean;
  pickupLocation: PickupLocationPresentation;
  selectedChoice: FulfillmentPresentationChoice;
};

type ChoiceCardProps = {
  disabled: boolean;
  eyebrow: string;
  onPress: () => void;
  pending: boolean;
  selected: boolean;
  supportingCopy: string;
  title: string;
};

function ChoiceCard({
  disabled,
  eyebrow,
  onPress,
  pending,
  selected,
  supportingCopy,
  title,
}: ChoiceCardProps) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${supportingCopy}`}
      accessibilityRole="radio"
      accessibilityState={{ busy: pending, checked: selected, disabled }}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => (
        <Surface
          background={selected ? 'ink' : 'surface'}
          bordered={false}
          padding="none"
          radius="action"
          style={[
            styles.choiceCard,
            disabled && styles.choiceCardDisabled,
            pressed && !disabled && styles.choiceCardPressed,
          ]}
        >
          <AppText
            color={selected ? 'accent' : 'textSubtle'}
            style={styles.choiceEyebrow}
            variant="label"
          >
            {eyebrow}
          </AppText>
          <AppText color={selected ? 'surface' : 'ink'} variant="subheading">
            {title}
          </AppText>
          <AppText
            color={selected ? 'heroSupporting' : 'textMuted'}
            style={styles.choiceSupportingCopy}
            variant="caption"
          >
            {supportingCopy}
          </AppText>
        </Surface>
      )}
    </Pressable>
  );
}

export function FulfillmentChoiceScreen({
  deliveryEntryEnabled,
  deliveryUnavailableCopy,
  errorMessage,
  merchantHeaderState,
  onContinue,
  onOpenAccount,
  onSelectChoice,
  pending = false,
  pickupLocation,
  selectedChoice,
}: FulfillmentChoiceScreenProps) {
  const state = getFulfillmentChoiceViewState(
    selectedChoice,
    deliveryEntryEnabled,
    pending,
  );
  const deliveryPresentation = getDeliveryChoicePresentation(
    deliveryEntryEnabled,
    deliveryUnavailableCopy,
  );

  const selectChoice = (requestedChoice: FulfillmentPresentationChoice) => {
    const selectableChoice = getSelectableFulfillmentChoice(
      requestedChoice,
      selectedChoice,
      deliveryEntryEnabled,
      pending,
    );

    if (selectableChoice) {
      onSelectChoice(selectableChoice);
    }
  };

  const continueWithChoice = () => {
    if (state.canContinue) {
      onContinue(selectedChoice);
    }
  };

  return (
    <Screen
      accessibilityLabel="Fulfillment choice"
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

      <AppText style={styles.heading} variant="heading">
        How do you want it?
      </AppText>

      <View accessibilityRole="radiogroup" style={styles.choices}>
        <ChoiceCard
          disabled={state.interactionsDisabled}
          eyebrow="PICKUP"
          onPress={() => selectChoice('pickup')}
          pending={pending}
          selected={state.displayedChoice === 'pickup'}
          supportingCopy={`${pickupLocation.locationName} · ${pickupLocation.address}`}
          title="Pick it up"
        />
        {deliveryPresentation.visible ? (
          <ChoiceCard
            disabled={state.deliveryDisabled}
            eyebrow="DELIVERY"
            onPress={() => selectChoice('delivery')}
            pending={pending}
            selected={state.displayedChoice === 'delivery'}
            supportingCopy={deliveryPresentation.supportingCopy}
            title="Bring it to me"
          />
        ) : null}
      </View>

      {errorMessage ? (
        <AppText accessibilityLiveRegion="polite" color="danger" variant="caption">
          {errorMessage}
        </AppText>
      ) : null}

      <Button
        disabled={!state.canContinue}
        label={state.actionLabel}
        loading={pending}
        onPress={continueWithChoice}
        style={styles.continueButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  choiceCard: {
    gap: spacing.navItemGap,
    minHeight: sizes.minimumTouchTarget,
    paddingHorizontal: spacing['4xl'],
    paddingVertical: spacing['4xl'],
  },
  choiceCardDisabled: {
    opacity: 0.56,
  },
  choiceEyebrow: {
    letterSpacing: 1.2,
    lineHeight: 13,
  },
  choiceCardPressed: {
    opacity: 0.78,
  },
  choiceSupportingCopy: {
    fontFamily: fontFamilies.bodyRegular,
  },
  choices: {
    gap: spacing.xl,
  },
  content: {
    backgroundColor: colors.contentCanvas,
    flexGrow: 1,
    gap: spacing.xl,
    minHeight: '100%',
    paddingBottom: spacing['7xl'],
    paddingHorizontal: spacing['5xl'],
    paddingTop: spacing['4xl'],
  },
  continueButton: {
    minHeight: sizes.actionControl,
    width: '100%',
  },
  heading: {
    marginTop: spacing.sm,
  },
  screen: {
    backgroundColor: colors.canvas,
  },
});
