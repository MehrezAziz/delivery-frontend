import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from './api/notification.service';

// Configure notification handler for foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Set up Android notification channels
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0284c7',
  });

  Notifications.setNotificationChannelAsync('order-updates', {
    name: 'Order Updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0284c7',
  });
}

/**
 * Register for push notifications and send token to backend
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get the push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // Uses the project ID from app.json
    });
    const token = tokenData.data;

    // Send token to backend
    const platform = Platform.OS as 'android' | 'ios';
    try {
      await notificationService.registerToken(token, platform);
      await AsyncStorage.setItem('pushToken', token);
    } catch (error) {
      console.error('Failed to register push token with backend:', error);
    }

    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Set up notification response listener (when user taps a notification)
 */
export function setupNotificationResponseListener() {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    handleNotificationTap(data);
  });
}

/**
 * Set up foreground notification listener
 */
export function setupNotificationReceivedListener(
  callback?: (notification: Notifications.Notification) => void,
) {
  return Notifications.addNotificationReceivedListener((notification) => {
    callback?.(notification);
  });
}

/**
 * Handle notification tap — navigate to relevant screen
 */
function handleNotificationTap(data: Record<string, any>) {
  const { relatedEntityType, relatedEntityId, type } = data;

  if (!relatedEntityType || !relatedEntityId) return;

  switch (relatedEntityType) {
    case 'Order':
      // Determine if customer or driver based on notification type
      const driverTypes = [
        'NEW_ORDER_AVAILABLE', 'ORDER_EXPIRED', 'ORDER_CANCELLED_BY_CUSTOMER',
        'PICKUP_REMINDER', 'PAYMENT_RECEIVED_COD', 'PAYMENT_CREDITED_WALLET',
        'NEW_MESSAGE_FROM_CUSTOMER',
      ];
      if (driverTypes.includes(type)) {
        router.push(`/(driver)/order-detail?orderId=${relatedEntityId}`);
      } else {
        router.push(`/(customer)/order-detail?orderId=${relatedEntityId}`);
      }
      break;

    case 'SupportTicket':
      // Navigate to support chat
      AsyncStorage.getItem('user').then((u) => {
        if (u) {
          const user = JSON.parse(u);
          if (user.role === 'DRIVER') {
            router.push(`/(driver)/support-chat?ticketId=${relatedEntityId}`);
          } else {
            router.push(`/(customer)/support-chat?ticketId=${relatedEntityId}`);
          }
        }
      });
      break;

    case 'Dispute':
      router.push(`/(customer)/order-detail?orderId=${relatedEntityId}`);
      break;

    case 'Rating':
      router.push('/(driver)/my-ratings');
      break;

    default:
      break;
  }
}

/**
 * Register driver notification action categories
 */
export async function registerDriverActionCategories() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationCategoryAsync('driver-order-actions', [
      {
        identifier: 'MARK_ARRIVED',
        buttonTitle: 'Mark Arrived',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'PICKED_UP',
        buttonTitle: 'Picked Up',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'START_DELIVERING',
        buttonTitle: 'Start Delivering',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'MARK_DELIVERED',
        buttonTitle: 'Mark Delivered',
        options: { opensAppToForeground: true },
      },
    ]);
  }
}
