import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function RewardsStackLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.canvas },
        headerShown: false,
      }}
    />
  );
}
