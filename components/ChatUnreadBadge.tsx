import { View, Text, StyleSheet } from 'react-native';

export function ChatUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={s.wrap} accessibilityLabel={`${count} unread messages`}>
      <Text style={s.txt}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    zIndex: 2,
    borderWidth: 2,
    borderColor: '#fff',
  },
  txt: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
