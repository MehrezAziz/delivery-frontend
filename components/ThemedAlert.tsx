import { useState, useCallback, createContext, useContext, ReactNode, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { setAppAlertImplementation, type AppAlertButton } from '../utils/appAlert';

export type ThemedAlertButton = AppAlertButton;

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: ThemedAlertButton[];
};

const defaultState: AlertState = {
  visible: false,
  title: '',
  message: undefined,
  buttons: [{ text: 'OK' }],
};

const AlertContext = createContext<(opts: Omit<AlertState, 'visible'> & { visible?: boolean }) => void>(() => {});

export function ThemedAlertProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AlertState>(defaultState);

  const show = useCallback((opts: Omit<AlertState, 'visible'> & { visible?: boolean }) => {
    setState({
      visible: true,
      title: opts.title,
      message: opts.message,
      buttons: opts.buttons?.length ? opts.buttons : [{ text: 'OK' }],
    });
  }, []);

  const hide = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  useEffect(() => {
    setAppAlertImplementation((title, message, buttons) => {
      show({
        title,
        message,
        buttons: buttons?.length ? buttons : [{ text: 'OK' }],
      });
    });
    return () => setAppAlertImplementation(null);
  }, [show]);

  return (
    <AlertContext.Provider value={show}>
      {children}
      <ThemedAlertModal state={state} onDismiss={hide} />
    </AlertContext.Provider>
  );
}

export function useThemedAlert() {
  return useContext(AlertContext);
}

function ThemedAlertModal({
  state,
  onDismiss,
}: {
  state: AlertState;
  onDismiss: () => void;
}) {
  const { colors, isDark } = useTheme();

  if (!state.visible) return null;

  const run = (fn?: () => void) => {
    onDismiss();
    setTimeout(() => fn?.(), 0);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: isDark ? 0.45 : 0.18,
                  shadowRadius: 20,
                },
                android: { elevation: 12 },
              }),
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>{state.title}</Text>
          {state.message ? (
            <Text style={[styles.message, { color: colors.textSecondary }]}>{state.message}</Text>
          ) : null}
          <View style={styles.btnRow}>
            {state.buttons.map((b, i) => {
              const isCancel = b.style === 'cancel';
              const isDest = b.style === 'destructive';
              return (
                <TouchableOpacity
                  key={`${b.text}-${i}`}
                  style={[
                    styles.btn,
                    {
                      backgroundColor: isCancel
                        ? colors.surfaceVariant
                        : isDest
                          ? colors.dangerBg
                          : colors.primaryLight,
                      borderColor: colors.border,
                      flex: state.buttons.length > 1 ? 1 : undefined,
                      minWidth: state.buttons.length > 1 ? 0 : '100%',
                    },
                  ]}
                  onPress={() => run(b.onPress)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '700',
                      color: isDest ? colors.danger : isCancel ? colors.textSecondary : colors.primary,
                      textAlign: 'center',
                    }}
                    numberOfLines={2}
                  >
                    {b.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  message: { fontSize: 15, lineHeight: 22, marginTop: 10 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
