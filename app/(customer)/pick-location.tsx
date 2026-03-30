import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
  TextInput, FlatList, Keyboard, Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../contexts/ThemeContext';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: { main_text: string; secondary_text: string };
}

export default function PickLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type: string }>();
  const { colors, isDark } = useTheme();
  const isPickup = params.type === 'pickup';
  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState<Region>({
    latitude: 36.8065, longitude: 10.1815, // Default: Tunis
    latitudeDelta: 0.02, longitudeDelta: 0.02,
  });
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(true);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get user's current location on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const newRegion = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          };
          setRegion(newRegion);
          mapRef.current?.animateToRegion(newRegion, 500);
        }
      } catch {}
      setGettingLocation(false);
    })();
  }, []);

  // Reverse geocode to get address name
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      if (GOOGLE_API_KEY) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}&language=en`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.results?.[0]) {
          setAddress(json.results[0].formatted_address);
          return;
        }
      }
      // Fallback to expo-location reverse geocode
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results[0]) {
        const r = results[0];
        setAddress([r.street, r.city, r.region].filter(Boolean).join(', '));
      } else {
        setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } catch {
      setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }
  };

  // Handle map tap
  const handleMapPress = (e: any) => {
    const coord = e.nativeEvent.coordinate;
    setMarker(coord);
    setPredictions([]);
    setSearchQuery('');
    Keyboard.dismiss();
    reverseGeocode(coord.latitude, coord.longitude);
  };

  // Search places
  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (text.length < 2) { setPredictions([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        if (GOOGLE_API_KEY) {
          const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_API_KEY}&types=geocode|establishment`;
          const res = await fetch(url);
          const json = await res.json();
          setPredictions(json.predictions || []);
        } else {
          // Fallback: use expo-location geocoding
          const results = await Location.geocodeAsync(text);
          if (results.length > 0) {
            const fakeResults: PlacePrediction[] = results.slice(0, 3).map((r, i) => ({
              place_id: `loc_${i}`,
              description: `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`,
              structured_formatting: {
                main_text: text,
                secondary_text: `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`,
              },
            }));
            setPredictions(fakeResults);
          }
        }
      } catch { setPredictions([]); }
    }, 350);
  };

  // Select a prediction
  const selectPrediction = async (prediction: PlacePrediction) => {
    setPredictions([]);
    setSearchQuery(prediction.structured_formatting.main_text);
    Keyboard.dismiss();
    try {
      let coord: { latitude: number; longitude: number } | null = null;
      let resolvedAddress = prediction.description;

      if (GOOGLE_API_KEY && !prediction.place_id.startsWith('loc_')) {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=geometry,formatted_address&key=${GOOGLE_API_KEY}`;
        const res = await fetch(url);
        const json = await res.json();
        const loc = json.result?.geometry?.location;
        if (loc) {
          coord = { latitude: loc.lat, longitude: loc.lng };
          resolvedAddress = json.result.formatted_address || prediction.description;
        }
      } else {
        // Fallback: geocode the search text
        const results = await Location.geocodeAsync(prediction.structured_formatting.main_text);
        if (results[0]) {
          coord = { latitude: results[0].latitude, longitude: results[0].longitude };
        }
      }

      if (coord) {
        setMarker(coord);
        setAddress(resolvedAddress);
        const newRegion = { ...coord, latitudeDelta: 0.005, longitudeDelta: 0.005 };
        mapRef.current?.animateToRegion(newRegion, 600);
      }
    } catch {}
  };

  // Confirm selection → save to AsyncStorage and go back to create-order
  const handleConfirm = async () => {
    if (!marker) return;
    const data = {
      lat: marker.latitude,
      lng: marker.longitude,
      address,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(`picked_${params.type}`, JSON.stringify(data));
    router.replace('/(customer)/create-order');
  };

  const accentColor = isPickup ? '#22c55e' : '#ef4444';
  const title = isPickup ? 'Pickup Location' : 'Delivery Location';

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={region}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {marker && (
          <Marker coordinate={marker} pinColor={accentColor} />
        )}
      </MapView>

      {/* Top bar with search */}
      <View style={styles.topBar}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card }]}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: accentColor }]}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.textTertiary} style={{ marginLeft: 12 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Search for a place..."
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setPredictions([]); }} style={{ padding: 8 }}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        {predictions.length > 0 && (
          <View style={[styles.predictionsContainer, { backgroundColor: colors.card }]}>
            <FlatList
              data={predictions.slice(0, 5)}
              keyExtractor={(item) => item.place_id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.predictionItem, { borderBottomColor: colors.border }]} onPress={() => selectPrediction(item)}>
                  <Ionicons name="location-outline" size={16} color={colors.textSecondary} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.predictionMain, { color: colors.text }]}>{item.structured_formatting.main_text}</Text>
                    <Text style={[styles.predictionSub, { color: colors.textSecondary }]} numberOfLines={1}>{item.structured_formatting.secondary_text}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {/* My location button */}
      <TouchableOpacity
        style={[styles.myLocationBtn, { backgroundColor: colors.card }]}
        onPress={async () => {
          try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setMarker(coord);
            reverseGeocode(coord.latitude, coord.longitude);
            mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 600);
          } catch {}
        }}
      >
        <Ionicons name="locate" size={22} color={colors.primary} />
      </TouchableOpacity>

      {/* Bottom card */}
      {marker && (
        <View style={[styles.bottomCard, { backgroundColor: colors.card }]}>
          <View style={[styles.bottomCardHandle, { backgroundColor: colors.border }]} />
          <View style={styles.addressRow}>
            <View style={[styles.dot, { backgroundColor: accentColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.addressLabel, { color: colors.textSecondary }]}>{isPickup ? 'Pickup from' : 'Deliver to'}</Text>
              <Text style={[styles.addressText, { color: colors.text }]} numberOfLines={2}>{address || 'Loading address...'}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: accentColor }]}
            onPress={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.confirmBtnText}>Confirm {isPickup ? 'Pickup' : 'Delivery'} Location</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Hint when no marker */}
      {!marker && !gettingLocation && (
        <View style={[styles.hintCard, { backgroundColor: colors.card }]}>
          <Ionicons name="hand-left-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>Tap on the map or search to select a location</Text>
        </View>
      )}

      {gettingLocation && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Getting your location...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 50, paddingHorizontal: 16, zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  title: { fontSize: 18, fontWeight: '700' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    borderRadius: 12, height: 48,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  searchInput: { flex: 1, paddingHorizontal: 10, fontSize: 15, color: '#111' },
  predictionsContainer: {
    backgroundColor: 'white', borderRadius: 12, marginTop: 4, maxHeight: 240, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  predictionItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6',
  },
  predictionMain: { fontSize: 14, fontWeight: '600', color: '#111' },
  predictionSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  myLocationBtn: {
    position: 'absolute', right: 16, bottom: 200,
    width: 48, height: 48, borderRadius: 24, backgroundColor: 'white',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 8,
  },
  bottomCardHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 16,
  },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: 12 },
  addressLabel: { fontSize: 12, color: '#6b7280', fontWeight: '500', marginBottom: 2 },
  addressText: { fontSize: 15, color: '#111', fontWeight: '600', lineHeight: 20 },
  confirmBtn: {
    height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  hintCard: {
    position: 'absolute', bottom: 40, left: 20, right: 20,
    backgroundColor: 'white', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  hintText: { color: '#6b7280', fontSize: 14, flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
});
