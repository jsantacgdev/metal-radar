import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import LeafletMap, { LeafletMarker } from '../components/LeafletMap';
import { useFocusEffect } from '@react-navigation/native';

const LOCATION_CACHE_KEY = 'last_known_location';
const LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

  // Convertir grupos a markers de Leaflet
  const markers = useMemo<LeafletMarker[]>(() => {
    return byVenue.map((group) => {
      const isFar = group.concerts.every((c) => c.distance_km > radiusKm);
      const count = group.concerts.length;
      const hasFestival = group.concerts.some((c) => c.is_festival);

      let color: string;
      if (isFar) color = colors.faint;
      else if (hasFestival) color = '#ffa500';
      else if (count > 1) color = colors.bloodBright;
      else color = colors.bloodDeep;

      return {
        id: group.venue.id,
        lat: group.venue.lat,
        lng: group.venue.lng,
        color,
        count,
      };
    });
  }, [byVenue, radiusKm]);

  const handleMarkerPress = (venueId: string) => {
    const group = byVenue.find((g) => g.venue.id === venueId);
    if (group) setSelectedVenue(group);
  };

  const lastFreshRef = useRef<number>(0);

  const loadLocation = useCallback(async (forceFresh = false) => {
    // Throttle: si pedimos fresh y ya hemos pedido hace <30s, ignoramos
    if (forceFresh && Date.now() - lastFreshRef.current < 30_000) {
      return;
    }

    // Si no se fuerza fresh, intentamos cache primero
    if (!forceFresh) {
      try {
        const cached = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < LOCATION_MAX_AGE_MS) {
            setLocation({ lat: parsed.lat, lng: parsed.lng });
          }
        }
      } catch {
        // ignore
      }
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      return;
    }

    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(fresh);
      lastFreshRef.current = Date.now();

      await AsyncStorage.setItem(
        LOCATION_CACHE_KEY,
        JSON.stringify({ ...fresh, timestamp: Date.now() }),
      );
    } catch (err) {
      console.warn('Error obteniendo ubicación:', err);
    }
  }, []);

  // Carga inicial al montar
  useEffect(() => {
    loadLocation();
  }, [loadLocation]);

  // Refrescar cada vez que se enfoca el tab (con throttle de 30s dentro de loadLocation)
  useFocusEffect(
    useCallback(() => {
      loadLocation(true);
    }, [loadLocation]),
  );

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <LeafletMap
        centerLat={location.lat}
        centerLng={location.lng}
        zoom={6}
        markers={markers}
        userLat={location.lat}
        userLng={location.lng}
        onMarkerPress={handleMarkerPress}
      />

      {/* Header flotante */}
      <View style={[styles.headerOverlay, { paddingTop: insets.top + spacing.xs }]}>
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
                    setSelectedVenue(null);
                    if (c.is_festival) {
                      const festivalId = c.id.replace(/^fest_/, '');
                      navigation.navigate('FestivalDetail', { festivalId });
                    } else {
                      navigation.navigate('ConcertDetail', { concertId: c.id });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {c.is_festival && (
                    <View style={styles.festivalBadge}>
                      <Text variant="monoSM" color="bloodBright">
                        🎪 FESTIVAL · {c.festival_name?.toUpperCase()}
                      </Text>
                    </View>
                  )}
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
  festivalBadge: {
    position: 'absolute',
    top: -12,
    left: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: 4,
    zIndex: 1,
  },
});
