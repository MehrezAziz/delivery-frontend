import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

type FriendlyErrorModalProps = {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
};

export default function FriendlyErrorModal({
  visible,
  title,
  message,
  onClose,
}: FriendlyErrorModalProps) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.emoji}>⚠️</Text>
          <Text style={s.title}>{title}</Text>
          <Text style={s.message}>{message}</Text>
          <TouchableOpacity style={s.button} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.buttonText}>{t('friendlyError.okGotIt')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  emoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 16,
  },
  button: {
    minWidth: 120,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
