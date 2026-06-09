import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNearbyConcerts, ConcertWithDetails } from '../hooks/useNearbyConcerts';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MapStackParamList } from '../navigation/MapStack';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_RADIUS_KM = 200;

const LOCATION_CACHE_KEY = 'last_known_location';
const LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export default function MapScreen() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<{
    venue: ConcertWithDetails['venue'];
    concerts: ConcertWithDetails[];
  } | null>(null);

  const { concerts, farConcerts, loading, error } = useNearbyConcerts(
    location?.lat ?? null,
    location?.lng ?? null,
    DEFAULT_RADIUS_KM,
  );

  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList>>();

  const visible = [...concerts, ...farConcerts];

  const byVenue = useMemo(() => {
    const map = new Map<
      string,
      { venue: ConcertWithDetails['venue']; concerts: ConcertWithDetails[] }
    >();
    for (const c of visible) {
      const existing = map.get(c.venue.id);
      if (existing) {
        existing.concerts.push(c);
      } else {
        map.set(c.venue.id, { venue: c.venue, concerts: [c] });
      }
    }
    // Ordenar conciertos de cada venue por fecha
    for (const group of map.values()) {
      group.concerts.sort(
        (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
      );
    }
    return Array.from(map.values());
  }, [visible]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLocation = async () => {
      try {
        const cached = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
        if (cached && !cancelled) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < LOCATION_MAX_AGE_MS) {
            setLocation({ lat: parsed.lat, lng: parsed.lng });
          }
        }
      } catch {
        // ignore
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) setPermissionDenied(true);
        return;
      }

      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced, // más rápido que High
        });
        if (cancelled) return;

        const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(fresh);

        await AsyncStorage.setItem(
          LOCATION_CACHE_KEY,
          JSON.stringify({ ...fresh, timestamp: Date.now() }),
        );
      } catch (err) {
        console.warn('Error obteniendo ubicación:', err);
      }
    };

    loadLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  if (permissionDenied) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Necesitamos permiso de ubicación.</Text>
        <Text style={styles.errorSub}>Actívalo en los ajustes del sistema.</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#dc2626" size="large" />
        <Text style={styles.loadingText}>Obteniendo ubicación...</Text>
      </View>
    );
  }

  const region: Region = {
    latitude: location.lat,
    longitude: location.lng,
    latitudeDelta: 3,
    longitudeDelta: 3,
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView style={{ flex: 1 }} initialRegion={region} showsUserLocation>
        {byVenue.map((group) => {
          const isFar = group.concerts.every((c) => c.distance_km > DEFAULT_RADIUS_KM);
          return (
            <Marker
              key={group.venue.id}
              coordinate={{ latitude: group.venue.lat, longitude: group.venue.lng }}
              pinColor={isFar ? '#999' : '#dc2626'}
              onPress={() => setSelectedVenue(group)}
            />
          );
        })}
      </MapView>

      {/* Banner de carga / errores */}
      {loading && (
        <View style={styles.topBanner}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.bannerText}>Cargando conciertos...</Text>
        </View>
      )}

      {/* Mensaje cuando no hay conciertos cerca */}
      {!loading && concerts.length === 0 && farConcerts.length > 0 && (
        <View style={styles.bottomCard}>
          <Text style={styles.cardTitle}>No hay conciertos a menos de {DEFAULT_RADIUS_KM}km</Text>
          <Text style={styles.cardSubtitle}>Pero hay {farConcerts.length} más lejos</Text>
          <TouchableOpacity style={styles.cardButton}>
            <Text style={styles.cardButtonText}>Mostrar todos</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cuando no hay nada en absoluto */}
      {!loading && concerts.length === 0 && farConcerts.length === 0 && (
        <View style={styles.bottomCard}>
          <Text style={styles.cardTitle}>Sin conciertos disponibles</Text>
          <Text style={styles.cardSubtitle}>Sigue más bandas o vuelve más tarde</Text>
        </View>
      )}

      {/* Popup del concierto seleccionado */}
      {selectedVenue && (
        <View style={styles.bottomCard}>
          <Text style={styles.cardTitle}>{selectedVenue.venue.name}</Text>
          <Text style={styles.cardSubtitle}>
            {selectedVenue.venue.city}
            {selectedVenue.venue.country ? ` · ${selectedVenue.venue.country}` : ''}
          </Text>
          <Text style={styles.cardMeta}>
            {selectedVenue.concerts[0].distance_km.toFixed(0)} km · {selectedVenue.concerts.length}{' '}
            {selectedVenue.concerts.length === 1 ? 'concierto' : 'conciertos'}
          </Text>

          <View style={styles.concertList}>
            {selectedVenue.concerts.map((c) => {
              const date = new Date(c.event_date);
              const dateStr = date.toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              });
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.concertRow}
                  onPress={() => {
                    const id = c.id;
                    setSelectedVenue(null);
                    navigation.navigate('ConcertDetail', { concertId: id });
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.concertBands} numberOfLines={1}>
                      {c.bands.map((b) => b.name).join(' · ')}
                    </Text>
                    <Text style={styles.concertDate}>{dateStr}</Text>
                  </View>
                  <Text style={styles.concertArrow}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedVenue(null)}>
            <Text style={styles.closeButtonText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.error}>Error: {error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 20,
  },
  loadingText: {
    color: '#999',
    marginTop: 12,
  },
  error: {
    color: '#dc2626',
    fontSize: 16,
    textAlign: 'center',
  },
  errorSub: {
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  topBanner: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerText: {
    color: '#fff',
    marginLeft: 10,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: '#bbb',
    fontSize: 14,
    marginBottom: 4,
  },
  cardMeta: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  cardButton: {
    marginTop: 12,
    backgroundColor: '#dc2626',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  cardButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  closeButton: {
    marginTop: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#999',
  },
  errorBanner: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(220,38,38,0.9)',
    padding: 12,
    borderRadius: 8,
  },
  concertList: {
    marginTop: 12,
    marginBottom: 4,
  },
  concertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  concertBands: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  concertDate: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
  },
  concertArrow: {
    color: '#666',
    fontSize: 20,
    marginLeft: 12,
  },
});
