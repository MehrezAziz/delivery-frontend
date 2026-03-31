import { setupBackgroundHandler } from './services/notifications';

// Register headless/background notification handlers before app startup.
setupBackgroundHandler();

// Continue with Expo Router app entry.
import 'expo-router/entry';
