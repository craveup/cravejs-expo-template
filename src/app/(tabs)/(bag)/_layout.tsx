import { Stack } from 'expo-router';

export default function BagStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="bag" />
      <Stack.Screen name="bag-clear" options={{ presentation: 'modal' }} />
      <Stack.Screen
        name="bag-remove-item"
        options={{ presentation: 'modal' }}
      />
    </Stack>
  );
}
