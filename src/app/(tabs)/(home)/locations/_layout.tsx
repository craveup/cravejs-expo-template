import { Stack } from 'expo-router';

import { colors } from '@/theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function LocationsStackLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.contentCanvas },
        headerShown: false,
      }}
    />
  );
}
