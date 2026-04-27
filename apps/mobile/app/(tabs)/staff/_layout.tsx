import { Stack } from 'expo-router';

export default function StaffLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="clock" />
      <Stack.Screen name="schedule" />
      <Stack.Screen name="tasks" options={{ presentation: 'modal' }} />
      <Stack.Screen name="shift-feedback" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
