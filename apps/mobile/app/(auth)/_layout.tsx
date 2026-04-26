import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="setup/index" />
      <Stack.Screen name="setup/restaurant" />
      <Stack.Screen name="setup/team" />
    </Stack>
  );
}
