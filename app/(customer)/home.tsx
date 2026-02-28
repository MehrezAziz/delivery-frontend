import { View, Text, ScrollView, StyleSheet } from 'react-native';

export default function CustomerHomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, Ahmed! 👋</Text>
        <Text style={styles.subtitle}>Where would you like to send your package?</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          <View style={styles.quickActionCard}>
            <View style={styles.quickActionIcon}>
              <Text style={styles.iconText}>📦</Text>
            </View>
            <View style={styles.quickActionContent}>
              <Text style={styles.quickActionTitle}>Create New Order</Text>
              <Text style={styles.quickActionSubtitle}>Send a package now</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </View>

          <View style={styles.actionRow}>
            <View style={styles.actionCard}>
              <Text style={styles.actionIcon}>📍</Text>
              <Text style={styles.actionTitle}>My Addresses</Text>
            </View>
            <View style={styles.actionCard}>
              <Text style={styles.actionIcon}>💳</Text>
              <Text style={styles.actionTitle}>My Wallet</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Orders</Text>
          
          <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <View>
                <Text style={styles.orderTitle}>Order #12345</Text>
                <Text style={styles.orderStatus}>Searching for driver...</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>SEARCHING</Text>
              </View>
            </View>

            <View style={styles.orderAddresses}>
              <View style={styles.addressRow}>
                <Text style={styles.addressIcon}>📍</Text>
                <Text style={styles.addressText}>Avenue Habib Bourguiba</Text>
              </View>
              <View style={styles.addressRow}>
                <Text style={styles.addressIcon}>📍</Text>
                <Text style={styles.addressText}>Avenue de la Liberté</Text>
              </View>
            </View>

            <View style={styles.orderFooter}>
              <Text style={styles.orderPrice}>25.00 TND</Text>
              <View style={styles.viewButton}>
                <Text style={styles.viewButtonText}>View Details</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  quickActionCard: {
    backgroundColor: '#0284c7',
    padding: 24,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  iconText: {
    fontSize: 24,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  quickActionSubtitle: {
    color: 'rgba(255,255,255,0.8)',
  },
  arrow: {
    color: 'white',
    fontSize: 24,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 16,
  },
  actionCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  actionTitle: {
    color: '#111827',
    fontWeight: '600',
  },
  orderCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  orderStatus: {
    color: '#6b7280',
  },
  statusBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  statusText: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '500',
  },
  orderAddresses: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
    marginBottom: 12,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  addressIcon: {
    marginRight: 8,
  },
  addressText: {
    color: '#374151',
    flex: 1,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
  },
  orderPrice: {
    color: '#111827',
    fontSize: 18,
    fontWeight: 'bold',
  },
  viewButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewButtonText: {
    color: 'white',
    fontWeight: '500',
  },
});
