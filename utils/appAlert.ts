import { Alert } from 'react-native';

export type AppAlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type Impl = (title: string, message?: string, buttons?: AppAlertButton[]) => void;

let themedImpl: Impl | null = null;

/** Called once from `ThemedAlertProvider`. */
export function setAppAlertImplementation(fn: Impl | null) {
  themedImpl = fn;
}

/**
 * Themed modal alert when the provider is mounted; falls back to React Native `Alert` otherwise.
 */
export function appAlert(title: string, message?: string, buttons?: AppAlertButton[]) {
  if (themedImpl) {
    themedImpl(title, message, buttons);
    return;
  }
  const fallback =
    buttons?.map((b) => ({
      text: b.text,
      style: b.style === 'destructive' ? ('destructive' as const) : b.style === 'cancel' ? ('cancel' as const) : ('default' as const),
      onPress: b.onPress,
    })) ?? [{ text: 'OK' }];
  Alert.alert(title, message, fallback as any);
}
