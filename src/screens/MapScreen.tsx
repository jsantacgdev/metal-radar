import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  View,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNearbyConcerts, ConcertWithDetails, ConcertScope } from '../hooks/useNearbyConcerts';
import { MapStackParamList } from '../navigation/MapStack';
import { useProfile } from '../hooks/useProfile';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';
import LeafletMap, { LeafletMarker } from '../components/LeafletMap';
import { localeFromI18n } from '../i18n';
import { useQueryClient } from '@tanstack/react-query';
import { syncAllConcerts } from '../lib/sync';
import { invalidateConcertQueries } from '../lib/queryInvalidation';

type ConcertTypeFilter = 'all' | 'concerts' | 'festivals';
type StatusFilter = 'all' | 'going' | 'interested';

const FILTERS_CACHE_KEY = 'map_filters_v1';
const LOCATION_CACHE_KEY = 'last_known_location';
const LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LOCATION_TIMEOUT_MS = 8000;

export default function MapScreen() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList>>();
  const { profile } = useProfile();
  const { t, i18n } = useTranslation();

  const locale = localeFromI18n(i18n.language);

  const homeLocation = useMemo(() => {
    if (profile?.home_lat != null && profile?.home_lng != null) {
      return { lat: profile.home_lat, lng: profile.home_lng };
    }
    return null;
  }, [profile?.home_lat, profile?.home_lng]);

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [usingHomeFallback, setUsingHomeFallback] = useState(false);
  const [noLocationAvailable, setNoLocationAvailable] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<{
    venue: ConcertWithDetails['venue'];
    concerts: ConcertWithDetails[];
  } | null>(null);
  const [typeFilter, setTypeFilter] = useState<ConcertTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // 'mine': solo bandas que sigues; 'all': todo lo que hay en tu radio.
  const [scopeFilter, setScopeFilter] = useState<ConcertScope>('mine');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const radiusKm = profile?.search_radius_km ?? 500;

  const { concerts, farConcerts, loading, isFetching, error } = useNearbyConcerts(
    location?.lat ?? null,
    location?.lng ?? null,
    radiusKm,
    scopeFilter,
  );
  const filtersActive = typeFilter !== 'all' || statusFilter !== 'all' || scopeFilter !== 'mine';

  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFetching) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      spinValue.stopAnimation();
      spinValue.setValue(0);
    }
  }, [isFetching, spinValue]);

  useEffect(() => {
    AsyncStorage.getItem(FILTERS_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (parsed.typeFilter) setTypeFilter(parsed.typeFilter);
          if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
          if (parsed.scopeFilter) setScopeFilter(parsed.scopeFilter);
        } catch {}
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(
      FILTERS_CACHE_KEY,
      JSON.stringify({ typeFilter, statusFilter, scopeFilter }),
    ).catch(() => {});
  }, [typeFilter, statusFilter, scopeFilter]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const visible = useMemo(() => {
    let all = [...concerts, ...farConcerts];

    if (typeFilter === 'concerts') {
      all = all.filter((c) => !c.is_festival);
    } else if (typeFilter === 'festivals') {
      all = all.filter((c) => c.is_festival);
    }

    if (statusFilter === 'going') {
      all = all.filter((c) => c.user_status === 'going');
    } else if (statusFilter === 'interested') {
      all = all.filter((c) => c.user_status === 'interested');
    }

    return all;
  }, [concerts, farConcerts, typeFilter, statusFilter]);

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

  const markers = useMemo<LeafletMarker[]>(() => {
    return byVenue.map((group) => {
      const isFar = group.concerts.every((c) => c.distance_km > radiusKm);
      const count = group.concerts.length;
      const hasFestival = group.concerts.some((c) => c.is_festival);

      let color: string;
      if (isFar && !hasFestival) color = colors.faint;
      else if (isFar && hasFestival) color = '#8b7765';
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

  const fallbackToHomeOrFail = useCallback(() => {
    if (homeLocation) {
      setLocation(homeLocation);
      setUsingHomeFallback(true);
      setNoLocationAvailable(false);
    } else {
      setNoLocationAvailable(true);
    }
  }, [homeLocation]);

  const loadLocation = useCallback(
    async (forceFresh = false) => {
      if (forceFresh && Date.now() - lastFreshRef.current < 30_000) {
        return;
      }

      if (!forceFresh) {
        try {
          const cached = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < LOCATION_MAX_AGE_MS) {
              setLocation({ lat: parsed.lat, lng: parsed.lng });
              setUsingHomeFallback(false);
            }
          }
        } catch {}
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        fallbackToHomeOrFail();
        return;
      }

      try {
        const pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Location timeout')), LOCATION_TIMEOUT_MS),
          ),
        ]);
        const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(fresh);
        setUsingHomeFallback(false);
        setNoLocationAvailable(false);
        lastFreshRef.current = Date.now();

        await AsyncStorage.setItem(
          LOCATION_CACHE_KEY,
          JSON.stringify({ ...fresh, timestamp: Date.now() }),
        );
      } catch (err) {
        console.warn('Error obteniendo ubicación:', err);
        fallbackToHomeOrFail();
      }
    },
    [fallbackToHomeOrFail],
  );

  useEffect(() => {
    loadLocation();
  }, [loadLocation]);

  const triggerBackgroundSync = useCallback(async () => {
    try {
      await syncAllConcerts();
      invalidateConcertQueries(queryClient);
    } catch (err) {
      console.warn('Background sync failed:', err);
    }
  }, [queryClient]);

  const handleManualRefresh = useCallback(() => {
    invalidateConcertQueries(queryClient);

    loadLocation(true).catch(() => {});

    triggerBackgroundSync();
  }, [queryClient, loadLocation, triggerBackgroundSync]);

  function FilterPill({
    label,
    active,
    onPress,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
  }) {
    return (
      <TouchableOpacity
        style={[styles.filterPill, active && styles.filterPillActive]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Text
          style={{
            fontFamily: fontFamily.mono,
            fontSize: 11,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: active ? colors.ink : colors.silver,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  if (noLocationAvailable) {
    return (
      <View style={styles.centered}>
        <Ionicons name="location-outline" size={48} color={colors.bloodBright} />
        <Text variant="displaySM" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
          {t('map.noLocationTitle')}
        </Text>
        <Text variant="body" color="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          {t('map.noLocationDesc')}
        </Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.bloodBright} size="large" />
        <Text variant="monoMD" color="muted" style={{ marginTop: spacing.lg }}>
          {t('map.gettingLocation')}
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
        maptilerKey={process.env.EXPO_PUBLIC_MAPTILER_KEY}
      />

      {/* Header flotante */}
      <View style={[styles.headerOverlay, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.headerCard}>
          <Ionicons
            name={usingHomeFallback ? 'home' : 'radio'}
            size={18}
            color={colors.bloodBright}
          />
          <View style={{ marginLeft: spacing.sm, flex: 1 }}>
            <Text
              style={{
                fontFamily: fontFamily.displayBold,
                fontSize: 14,
                letterSpacing: 1,
                color: colors.bright,
                textTransform: 'uppercase',
              }}
            >
              {t('map.title')}
            </Text>
            <Text variant="monoSM" color="muted" numberOfLines={1}>
              {usingHomeFallback
                ? t('map.headerSummaryHome', { total: visible.length })
                : t('map.headerSummary', { total: visible.length, near: concerts.length })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => setFiltersOpen(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            accessibilityLabel={t('common.filter')}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={filtersActive ? colors.bloodBright : colors.silver}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={handleManualRefresh}
            activeOpacity={0.7}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons
                name="refresh"
                size={18}
                color={isFetching ? colors.bloodBright : colors.silver}
              />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => navigation.navigate('AddConcert')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            accessibilityLabel={t('common.add')}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.silver} />
          </TouchableOpacity>
        </View>
      </View>

      {loading && (
        <View style={[styles.loadingBanner, { top: insets.top + 80 }]}>
          <ActivityIndicator color={colors.bloodBright} size="small" />
          <Text variant="monoSM" color="silver" style={{ marginLeft: spacing.sm }}>
            {t('map.loadingConcerts')}
          </Text>
        </View>
      )}

      {!loading && visible.length === 0 && (
        <View style={styles.emptyCard}>
          <Text variant="displaySM" style={{ textAlign: 'center' }}>
            {t('map.emptyTitle')}
          </Text>
          <Text variant="bodySM" color="muted" style={styles.emptyText}>
            {t('map.emptyDesc')}
          </Text>
        </View>
      )}

      {selectedVenue && (
        <View style={styles.bottomCard}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="monoSM" color="bloodBright">
                {t('map.venueSummary', {
                  km: selectedVenue.concerts[0].distance_km.toFixed(0),
                  count: selectedVenue.concerts.length,
                })}
              </Text>
              <Text variant="displaySM" numberOfLines={1} style={{ marginTop: 4 }}>
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
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.concertList}>
            {selectedVenue.concerts.map((c, i) => {
              const date = new Date(c.event_date);
              const month = date
                .toLocaleDateString(locale, { month: 'short' })
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

                  {!c.is_festival && (
                    <BandImage
                      url={firstBand?.image_url ?? null}
                      size={44}
                      showTag={!firstBand?.image_url}
                      style={{ marginLeft: spacing.md }}
                    />
                  )}
                  <View style={styles.concertInfo}>
                    {c.is_festival ? (
                      <>
                        <Text variant="displayMD" numberOfLines={1} style={{ color: '#ffa500' }}>
                          {c.festival_name}
                        </Text>
                        <Text
                          variant="monoSM"
                          color="muted"
                          style={{ marginTop: 2 }}
                          numberOfLines={1}
                        >
                          {t('map.bandsPrefix')}{' '}
                          {c.bands
                            .map((b) => b.name)
                            .join(' · ')
                            .slice(0, 25)}
                          ...
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text variant="displaySM" numberOfLines={1}>
                          {c.bands.map((b) => b.name).join(' · ')}
                        </Text>
                      </>
                    )}
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
      <Modal
        visible={filtersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable style={styles.filtersPanel} onPress={() => {}}>
            <View style={styles.filtersHeader}>
              <Text variant="displaySM">{t('map.filtersTitle')}</Text>
              <TouchableOpacity
                onPress={() => setFiltersOpen(false)}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <Text variant="monoMD" color="muted" style={styles.filterLabel}>
              {t('map.filterScopeLabel')}
            </Text>
            <View style={styles.filterRow}>
              <FilterPill
                label={t('map.filterScopeMine')}
                active={scopeFilter === 'mine'}
                onPress={() => setScopeFilter('mine')}
              />
              <FilterPill
                label={t('map.filterScopeAll')}
                active={scopeFilter === 'all'}
                onPress={() => setScopeFilter('all')}
              />
            </View>

            <Text variant="monoMD" color="muted" style={styles.filterLabel}>
              {t('map.filterTypeLabel')}
            </Text>
            <View style={styles.filterRow}>
              <FilterPill
                label={t('map.filterTypeAll')}
                active={typeFilter === 'all'}
                onPress={() => setTypeFilter('all')}
              />
              <FilterPill
                label={t('map.filterTypeConcerts')}
                active={typeFilter === 'concerts'}
                onPress={() => setTypeFilter('concerts')}
              />
              <FilterPill
                label={t('map.filterTypeFestivals')}
                active={typeFilter === 'festivals'}
                onPress={() => setTypeFilter('festivals')}
              />
            </View>

            <Text variant="monoMD" color="muted" style={styles.filterLabel}>
              {t('map.filterStatusLabel')}
            </Text>
            <View style={styles.filterRow}>
              <FilterPill
                label={t('map.filterStatusAll')}
                active={statusFilter === 'all'}
                onPress={() => setStatusFilter('all')}
              />
              <FilterPill
                label={t('map.filterStatusGoing')}
                active={statusFilter === 'going'}
                onPress={() => setStatusFilter('going')}
              />
              <FilterPill
                label={t('map.filterStatusInterested')}
                active={statusFilter === 'interested'}
                onPress={() => setStatusFilter('interested')}
              />
            </View>

            {filtersActive && (
              <TouchableOpacity
                style={styles.clearFiltersBtn}
                onPress={() => {
                  setTypeFilter('all');
                  setStatusFilter('all');
                  setScopeFilter('mine');
                }}
                activeOpacity={0.7}
              >
                <Text variant="monoSM" color="bloodBright">
                  {t('map.clearFilters')}
                </Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
    marginTop: spacing.sm,
  },
  concertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  dateBox: {
    width: 44,
    height: 49,
    borderRadius: radius.sm,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
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
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  filtersPanel: {
    backgroundColor: colors.ink,
    borderTopWidth: 1,
    borderColor: colors.line,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  filtersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  filterLabel: {
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  filterPillActive: {
    backgroundColor: colors.silver,
    borderColor: colors.silver,
  },
  clearFiltersBtn: {
    marginTop: spacing.xl,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
});
