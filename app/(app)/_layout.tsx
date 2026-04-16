import { Stack } from 'expo-router';
import { C } from '@/constants/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: C.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="home" />
      <Stack.Screen name="reader" />
      <Stack.Screen name="book" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
