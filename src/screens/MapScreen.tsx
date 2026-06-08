import { useEffect, useState } from 'react';
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
  const [selected, setSelected] = useState<ConcertWithDetails | null>(null);
  const [showFar, setShowFar] = useState(false);

  const { concerts, farConcerts, loading, error } = useNearbyConcerts(
    location?.lat ?? null,
    location?.lng ?? null,
    DEFAULT_RADIUS_KM,
  );

  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList>>();

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

  const visible = showFar ? [...concerts, ...farConcerts] : concerts;

  return (
    <View style={{ flex: 1 }}>
      <MapView style={{ flex: 1 }} initialRegion={region} showsUserLocation>
        {visible.map((c) => (
          <Marker
            key={c.id}
            coordinate={{ latitude: c.venue.lat, longitude: c.venue.lng }}
            pinColor={c.distance_km > DEFAULT_RADIUS_KM ? '#999' : '#dc2626'}
            onPress={() => setSelected(c)}
          />
        ))}
      </MapView>

      {/* Banner de carga / errores */}
      {loading && (
        <View style={styles.topBanner}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.bannerText}>Cargando conciertos...</Text>
        </View>
      )}

      {/* Mensaje cuando no hay conciertos cerca */}
      {!loading && concerts.length === 0 && farConcerts.length > 0 && !showFar && (
        <View style={styles.bottomCard}>
          <Text style={styles.cardTitle}>No hay conciertos a menos de {DEFAULT_RADIUS_KM}km</Text>
          <Text style={styles.cardSubtitle}>Pero hay {farConcerts.length} más lejos</Text>
          <TouchableOpacity style={styles.cardButton} onPress={() => setShowFar(true)}>
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
      {selected && (
        <View style={styles.bottomCard}>
          <Text style={styles.cardTitle}>{selected.bands.map((b) => b.name).join(' · ')}</Text>
          <Text style={styles.cardSubtitle}>
            {selected.venue.name} · {selected.venue.city}
          </Text>
          <Text style={styles.cardMeta}>
            {new Date(selected.event_date).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {'  ·  '}
            {selected.distance_km.toFixed(0)} km
          </Text>
          {selected.price_min && (
            <Text style={styles.cardMeta}>
              Desde {selected.price_min} {selected.currency}
            </Text>
          )}
          <TouchableOpacity
            style={styles.cardButton}
            onPress={() => {
              const id = selected.id;
              setSelected(null);
              navigation.navigate('ConcertDetail', { concertId: id });
            }}
          >
            <Text style={styles.cardButtonText}>Ver detalle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={() => setSelected(null)}>
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
});
