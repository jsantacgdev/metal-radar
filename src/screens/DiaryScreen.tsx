import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DiaryEntry, useDiary } from '../hooks/useDiary';
import { useDiaryStats } from '../hooks/useDiaryStats';
import { useUpdateConcertStatus } from '../hooks/useUpdateConcertStatus';
import { DiaryStackParamList } from '../navigation/DiaryStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';

type Filter = 'upcoming' | 'past';

const CURRENT_YEAR = new Date().getFullYear();

export default function DiaryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<DiaryStackParamList>>();
  const { entries, loading, error, reload } = useDiary();
  const stats = useDiaryStats(entries, CURRENT_YEAR);
  const [filter, setFilter] = useState<Filter>('past');

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: DiaryEntry[] = [];
    const pa: DiaryEntry[] = [];
    for (const e of entries) {
      const isPast = new Date(e.concert.event_date).getTime() < now;
      if (e.status === 'attended' || isPast) pa.push(e);
      else up.push(e);
    }
    return { upcoming: up, past: pa };
  }, [entries]);

  const filtered = filter === 'upcoming' ? upcoming : past;

  // ¿Mostrar banner Wrapped? Por ahora siempre, en Fase 3 se condicionará a diciembre
  const showWrappedBanner = filter === 'past' && stats.shows > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text variant="monoMD" color="muted">
          TU HISTORIAL
        </Text>
        <Text variant="displayLG" style={{ marginTop: 4 }}>
          Diario
        </Text>
      </View>

      {/* Stats strip: SHOWS / BANDAS / AÑO */}
      <View style={styles.statsStrip}>
        <StatCard value={stats.shows.toString()} label="SHOWS" accent />
        <StatCard value={stats.bands.toString()} label="BANDAS" />
        <StatCard value={CURRENT_YEAR.toString()} label="AÑO" />
      </View>

      {/* Banner Wrapped */}
      {showWrappedBanner && (
        <TouchableOpacity
          style={styles.wrappedBanner}
          activeOpacity={0.85}
          onPress={() => {
            // TODO Fase 3: navegar a Wrapped
          }}
        >
          <View style={styles.wrappedFlame}>
            <Ionicons name="flame" size={18} color={colors.bloodBright} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="displaySM">Tu Wrapped {CURRENT_YEAR} está listo</Text>
            <Text variant="monoSM" color="muted" style={{ marginTop: 2 }}>
              {stats.km.toLocaleString('es-ES')} km de directo
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.silver} />
        </TouchableOpacity>
      )}

      <View style={styles.tabsRow}>
        <TabPill
          label={`Pasados · ${past.length}`}
          active={filter === 'past'}
          onPress={() => setFilter('past')}
        />
        <TabPill
          label={`Próximos · ${upcoming.length}`}
          active={filter === 'upcoming'}
          onPress={() => setFilter('upcoming')}
        />
      </View>

      {filter === 'past' && (
        <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
          RECIENTES
        </Text>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text variant="bodySM" color="bloodBright">
            {error}
          </Text>
        </View>
      )}

      {loading && entries.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text variant="displaySM" color="silver" style={{ textAlign: 'center' }}>
            {filter === 'upcoming' ? 'Sin próximos conciertos' : 'Sin conciertos pasados'}
          </Text>
          <Text variant="bodySM" color="muted" style={styles.emptySub}>
            {filter === 'upcoming'
              ? 'Marca conciertos como "Voy" desde el mapa'
              : 'Aquí aparecerán los conciertos a los que asistas'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={reload}
              tintColor={colors.bloodBright}
            />
          }
          renderItem={({ item }) => (
            <DiaryItem
              entry={item}
              onPress={() => navigation.navigate('ConcertDetail', { concertId: item.concert_id })}
            />
          )}
        />
      )}
    </View>
  );
}

function StatCard({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={styles.statCard}>
      <Text
        style={{
          fontFamily: fontFamily.displayBold,
          fontSize: 24,
          letterSpacing: -0.4,
          color: accent ? colors.bloodBright : colors.bright,
        }}
      >
        {value}
      </Text>
      <Text variant="monoSM" color="muted" style={{ marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}

function TabPill({
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
      style={[styles.tabPill, active && styles.tabPillActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={{
          fontFamily: fontFamily.mono,
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: active ? colors.ink : colors.silver,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function RatingTriangles({ rating }: { rating: number }) {
  // rating 0-5
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name="triangle"
          size={9}
          color={i <= rating ? colors.bloodBright : colors.faint}
        />
      ))}
    </View>
  );
}

function DiaryItem({ entry, onPress }: { entry: DiaryEntry; onPress: () => void }) {
  const date = new Date(entry.concert.event_date);
  const updateStatus = useUpdateConcertStatus();
  const firstBand = entry.concert.bands[0];

  const dateLabel = date
    .toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    })
    .toUpperCase()
    .replace(/\./g, '');

  const isPastGoing = entry.status === 'going' && date.getTime() < Date.now();

  const handleConfirmAttended = (e: any) => {
    e.stopPropagation();
    updateStatus.mutate({ userConcertId: entry.id, status: 'attended' });
  };

  const handleConfirmNotAttended = (e: any) => {
    e.stopPropagation();
    updateStatus.mutate({ userConcertId: entry.id, status: 'interested' });
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <BandImage
        url={firstBand?.image_url ?? null}
        size={48}
        radiusOverride={radius.sm}
        showTag={!firstBand?.image_url}
      />

      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <Text variant="displaySM" numberOfLines={1} style={{ flex: 1 }}>
            {entry.concert.bands.map((b) => b.name).join(' · ')}
          </Text>
          <Text variant="monoSM" color="muted" style={{ marginLeft: spacing.sm }}>
            {dateLabel}
          </Text>
        </View>

        <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 4 }}>
          {entry.concert.venue.name}
          {entry.concert.venue.city ? ` · ${entry.concert.venue.city.toUpperCase()}` : ''}
        </Text>

        {/* Rating + (placeholder Fase 2 setlist) */}
        {entry.status === 'attended' && (
          <View style={styles.metaRow}>
            <RatingTriangles rating={entry.rating ?? 0} />
            {/* Fase 2: <Text variant="monoSM" color="muted">19 TEMAS · SETLIST REAL</Text> */}
          </View>
        )}

        {/* CTA inline para confirmar asistencia */}
        {isPastGoing && (
          <View style={styles.confirmRow}>
            <Text variant="monoSM" color="silver" style={{ marginRight: spacing.sm }}>
              ¿FUISTE?
            </Text>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmBtnYes]}
              onPress={handleConfirmAttended}
              activeOpacity={0.8}
              disabled={updateStatus.isPending}
            >
              <Text variant="monoSM" style={{ color: colors.ink }}>
                SÍ
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirmNotAttended}
              activeOpacity={0.8}
              disabled={updateStatus.isPending}
            >
              <Text variant="monoSM" color="silver">
                NO
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.xl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  statsStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  wrappedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  wrappedFlame: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tabPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'transparent',
  },
  tabPillActive: {
    backgroundColor: colors.silver,
    borderColor: colors.silver,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  errorBox: {
    padding: spacing.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptySub: {
    textAlign: 'center',
    marginTop: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  cardContent: {
    flex: 1,
    marginLeft: spacing.md,
    minWidth: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  confirmBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 6,
  },
  confirmBtnYes: {
    backgroundColor: colors.bloodBright,
    borderColor: colors.bloodBright,
  },
});
