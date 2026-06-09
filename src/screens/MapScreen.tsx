import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNearbyConcerts, ConcertWithDetails } from '../hooks/useNearbyConcerts';
import { MapStackParamList } from '../navigation/MapStack';
import { useProfile } from '../hooks/useProfile';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';

const LOCATION_CACHE_KEY = 'last_known_location';
const LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d22' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0c' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#82858d' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#c7cad0' }],
  },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a30' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0a0c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5a5d64' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList>>();
  const { profile } = useProfile();

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<{
    venue: ConcertWithDetails['venue'];
    concerts: ConcertWithDetails[];
  } | null>(null);

  const radiusKm = profile?.search_radius_km ?? 500;

  const { concerts, farConcerts, loading, error } = useNearbyConcerts(
    location?.lat ?? null,
    location?.lng ?? null,
    radiusKm,
  );

  // Mostrar todos los markers, distinguiendo cercanos y lejanos por color
  const visible = useMemo(() => [...concerts, ...farConcerts], [concerts, farConcerts]);

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
    for (const group of map.values()) {
      group.concerts.sort(
        (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
      );
    }
    return Array.from(map.values());
  }, [visible]);

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
          accuracy: Location.Accuracy.Balanced,
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
        <Ionicons name="location-outline" size={48} color={colors.bloodBright} />
        <Text variant="displaySM" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
          Permiso de ubicación necesario
        </Text>
        <Text variant="body" color="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          Actívalo en los ajustes del sistema para ver conciertos cerca
        </Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.bloodBright} size="large" />
        <Text variant="monoMD" color="muted" style={{ marginTop: spacing.lg }}>
          OBTENIENDO UBICACIÓN...
        </Text>
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
    <View style={{ flex: 1, backgroundColor: colors.ink, marginTop: spacing.xxxl }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={region}
        showsUserLocation
        customMapStyle={DARK_MAP_STYLE}
      >
        {byVenue.map((group) => {
          const isFar = group.concerts.every((c) => c.distance_km > radiusKm);
          return (
            <Marker
              key={group.venue.id}
              coordinate={{ latitude: group.venue.lat, longitude: group.venue.lng }}
              pinColor={isFar ? colors.silver : colors.bloodBright}
              onPress={() => setSelectedVenue(group)}
            />
          );
        })}
      </MapView>

      {/* Header flotante */}
      <View style={[styles.headerOverlay, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerCard}>
          <Ionicons name="radio" size={18} color={colors.bloodBright} />
          <View style={{ marginLeft: spacing.sm }}>
            <Text
              style={{
                fontFamily: fontFamily.displayBold,
                fontSize: 14,
                letterSpacing: 1,
                color: colors.bright,
                textTransform: 'uppercase',
              }}
            >
              Mapa
            </Text>
            <Text variant="monoSM" color="muted">
              {visible.length} CONCIERTOS · {concerts.length} CERCA
            </Text>
          </View>
        </View>
      </View>

      {loading && (
        <View style={[styles.loadingBanner, { top: insets.top + 80 }]}>
          <ActivityIndicator color={colors.bloodBright} size="small" />
          <Text variant="monoSM" color="silver" style={{ marginLeft: spacing.sm }}>
            CARGANDO CONCIERTOS...
          </Text>
        </View>
      )}

      {/* Empty state cuando no hay nada */}
      {!loading && visible.length === 0 && (
        <View style={styles.emptyCard}>
          <Text variant="displaySM" style={{ textAlign: 'center' }}>
            Sin conciertos disponibles
          </Text>
          <Text variant="bodySM" color="muted" style={styles.emptyText}>
            Sigue más bandas en el Radar o vuelve más tarde
          </Text>
        </View>
      )}

      {/* Popup del venue seleccionado */}
      {selectedVenue && (
        <View style={styles.bottomCard}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="monoSM" color="bloodBright">
                {selectedVenue.concerts[0].distance_km.toFixed(0)} KM ·{' '}
                {selectedVenue.concerts.length === 1
                  ? '1 CONCIERTO'
                  : `${selectedVenue.concerts.length} CONCIERTOS`}
              </Text>
              <Text variant="displayMD" numberOfLines={1} style={{ marginTop: 4 }}>
                {selectedVenue.venue.name}
              </Text>
              <Text variant="monoSM" color="muted" style={{ marginTop: 4 }}>
                {selectedVenue.venue.city?.toUpperCase()}
                {selectedVenue.venue.country
                  ? ` · ${selectedVenue.venue.country.toUpperCase()}`
                  : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedVenue(null)}
              style={styles.closeBtn}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.concertList}>
            {selectedVenue.concerts.map((c, i) => {
              const date = new Date(c.event_date);
              const month = date
                .toLocaleDateString('es-ES', { month: 'short' })
                .toUpperCase()
                .replace('.', '');
              const day = date.getDate().toString();
              const firstBand = c.bands[0];

              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.concertRow,
                    i === selectedVenue.concerts.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => {
                    const id = c.id;
                    setSelectedVenue(null);
                    navigation.navigate('ConcertDetail', { concertId: id });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.dateBox}>
                    <Text
                      style={{
                        fontFamily: fontFamily.mono,
                        fontSize: 9,
                        letterSpacing: 1,
                        color: colors.bloodBright,
                      }}
                    >
                      {month}
                    </Text>
                    <Text
                      style={{
                        fontFamily: fontFamily.displayBold,
                        fontSize: 18,
                        lineHeight: 20,
                        color: colors.bright,
                      }}
                    >
                      {day}
                    </Text>
                  </View>
                  <BandImage
                    url={firstBand?.image_url ?? null}
                    size={44}
                    showTag={!firstBand?.image_url}
                    style={{ marginLeft: spacing.md }}
                  />
                  <View style={styles.concertInfo}>
                    <Text variant="displaySM" numberOfLines={1}>
                      {c.bands.map((b) => b.name).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {error && (
        <View style={[styles.errorBanner, { top: insets.top + 80 }]}>
          <Text variant="bodySM" color="bloodBright">
            {error}
          </Text>
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
    backgroundColor: colors.ink,
    padding: spacing.xl,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,10,12,0.85)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  loadingBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,10,12,0.85)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  emptyCard: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  bottomCard: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: 400,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  concertList: {
    marginTop: spacing.lg,
  },
  concertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  dateBox: {
    width: 44,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  concertInfo: {
    flex: 1,
    marginLeft: spacing.md,
    minWidth: 0,
  },
  errorBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
  },
});
