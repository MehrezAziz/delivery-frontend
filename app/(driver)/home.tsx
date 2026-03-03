import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

export default function DriverHomeScreen() {
  const availableOrders = [
    { 
      id: '12345', 
      from: 'Tunis Centre', 
      to: 'La Marsa', 
      distance: '8.5 km',
      price: '25.00',
      type: 'SAME_GOVERNORATE',
      weight: '3.5 kg'
    },
    { 
      id: '12346', 
      from: 'Tunis Centre', 
      to: 'Ariana Ville', 
      distance: '5.2 km',
      price: '15.00',
      type: 'SAME_DELEGATION',
      weight: '1.2 kg'
    },
  ];

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'SAME_DELEGATION': 
        return { bg: '#dcfce7', text: '#166534' };
      case 'SAME_GOVERNORATE': 
        return { bg: '#dbeafe', text: '#1e40af' };
      case 'DIFFERENT_GOVERNORATE': 
        return { bg: '#fed7aa', text: '#9a3412' };
      case 'DIFFERENT_COUNTRY': 
        return { bg: '#fee2e2', text: '#991b1b' };
      default: 
        return { bg: '#f3f4f6', text: '#374151' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Available Orders</Text>
        <Text style={styles.headerSubtitle}>Accept orders to start earning</Text>
      </View>

      {/* Status Card */}
      <View style={styles.statusCardContainer}>
        <View style={styles.statusCard}>
          <View style={styles.statusIndicatorContainer}>
            <View style={styles.statusIndicatorOuter}>
              <View style={styles.statusIndicatorInner} />
            </View>
          </View>
          <View style={styles.statusTextContainer}>
            <Text style={styles.statusTitle}>Online</Text>
            <Text style={styles.statusSubtitle}>Ready to accept orders</Text>
          </View>
          <TouchableOpacity style={styles.statusButton}>
            <Text style={styles.statusButtonText}>Go Offline</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Priority Info */}
        <View style={styles.priorityCard}>
          <Text style={styles.priorityTitle}>📍 Priority Orders</Text>
          <Text style={styles.priorityText}>
            Orders in your area are shown first for better earnings
          </Text>
        </View>

        {/* Available Orders */}
        {availableOrders.map((order) => {
          const typeStyle = getTypeStyle(order.type);
          return (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <View>
                  <Text style={styles.orderId}>Order #{order.id}</Text>
                  <View style={[styles.typeBadge, { backgroundColor: typeStyle.bg }]}>
                    <Text style={[styles.typeBadgeText, { color: typeStyle.text }]}>
                      {order.type.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
                <View style={styles.priceContainer}>
                  <Text style={styles.price}>{order.price}</Text>
                  <Text style={styles.currency}>TND</Text>
                </View>
              </View>

              <View style={styles.orderDetails}>
                <View style={styles.locationRow}>
                  <Text style={styles.locationIcon}>📍</Text>
                  <Text style={styles.locationText}>From: {order.from}</Text>
                </View>
                <View style={styles.locationRow}>
                  <Text style={styles.locationIcon}>📍</Text>
                  <Text style={styles.locationText}>To: {order.to}</Text>
                </View>
                
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaIcon}>📏</Text>
                    <Text style={styles.metaText}>{order.distance}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaIcon}>⚖️</Text>
                    <Text style={styles.metaText}>{order.weight}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.acceptButton} activeOpacity={0.8}>
                <Text style={styles.acceptButtonText}>Accept Order</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Empty State */}
        {availableOrders.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Orders Available</Text>
            <Text style={styles.emptyText}>
              New orders will appear here when customers place them
            </Text>
          </View>
        )}
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
    backgroundColor: '#c026d3',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 24,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
  },
  statusCardContainer: {
    marginHorizontal: 24,
    marginTop: -16,
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  statusIndicatorContainer: {
    marginRight: 16,
  },
  statusIndicatorOuter: {
    width: 48,
    height: 48,
    backgroundColor: '#dcfce7',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIndicatorInner: {
    width: 24,
    height: 24,
    backgroundColor: '#22c55e',
    borderRadius: 12,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    color: '#111827',
    fontWeight: 'bold',
    fontSize: 18,
  },
  statusSubtitle: {
    color: '#6b7280',
    fontSize: 14,
  },
  statusButton: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusButtonText: {
    color: '#374151',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  priorityCard: {
    backgroundColor: '#dbeafe',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  priorityTitle: {
    color: '#1e3a8a',
    fontWeight: 'bold',
    marginBottom: 8,
    fontSize: 15,
  },
  priorityText: {
    color: '#1e40af',
    fontSize: 14,
  },
  orderCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderId: {
    color: '#111827',
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  typeBadgeText: {
    fontWeight: '600',
    fontSize: 12,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    color: '#c026d3',
    fontWeight: 'bold',
    fontSize: 28,
  },
  currency: {
    color: '#6b7280',
    fontSize: 14,
  },
  orderDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationIcon: {
    marginRight: 8,
    fontSize: 16,
  },
  locationText: {
    color: '#374151',
    flex: 1,
    fontWeight: '600',
    fontSize: 15,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    marginRight: 4,
    fontSize: 14,
  },
  metaText: {
    color: '#6b7280',
    fontSize: 14,
  },
  acceptButton: {
    backgroundColor: '#c026d3',
    paddingVertical: 12,
    borderRadius: 8,
  },
  acceptButtonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyState: {
    backgroundColor: '#ffffff',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#111827',
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 8,
  },
  emptyText: {
    color: '#6b7280',
    textAlign: 'center',
    fontSize: 15,
  },
});
