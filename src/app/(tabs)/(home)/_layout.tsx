import { Stack } from 'expo-router';

import { colors } from '@/theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function HomeStackLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.canvas },
        headerShown: false,
      }}
    >
      <Stack.Screen name="fulfillment" />
      <Stack.Screen name="delivery/address" />
      <Stack.Screen name="delivery/status" />
      <Stack.Screen name="schedule" />
      <Stack.Screen
        name="locations"
        options={{ presentation: 'modal' }}
      />
    </Stack>
  );
}
