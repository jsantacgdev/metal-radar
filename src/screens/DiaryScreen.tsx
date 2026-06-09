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
import { DiaryStackParamList } from '../navigation/DiaryStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';

type Filter = 'upcoming' | 'past';

export default function DiaryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<DiaryStackParamList>>();
  const { entries, loading, error, reload } = useDiary();
  const [filter, setFilter] = useState<Filter>('upcoming');

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

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text variant="monoMD" color="muted">
            TU HISTORIAL
          </Text>
          <Text variant="displayLG" style={{ marginTop: 4 }}>
            Diario
          </Text>
        </View>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <StatCard value={upcoming.length} label="PRÓXIMOS" accent />
        <StatCard value={past.length} label="ASISTIDOS" />
        <StatCard
          value={new Set(entries.map((e) => e.concert.bands[0]?.id).filter(Boolean)).size}
          label="BANDAS"
        />
      </View>

      {/* Tabs filtro */}
      <View style={styles.tabsRow}>
        <TabPill
          label={`Próximos · ${upcoming.length}`}
          active={filter === 'upcoming'}
          onPress={() => setFilter('upcoming')}
        />
        <TabPill
          label={`Pasados · ${past.length}`}
          active={filter === 'past'}
          onPress={() => setFilter('past')}
        />
      </View>

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

function StatCard({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
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

function DiaryItem({ entry, onPress }: { entry: DiaryEntry; onPress: () => void }) {
  const date = new Date(entry.concert.event_date);
  const month = date.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
  const day = date.getDate().toString();

  const statusLabel: Record<DiaryEntry['status'], string> = {
    interested: 'INTERESADO',
    going: 'VOY',
    attended: 'ASISTÍ',
  };

  const isHighlight = entry.status === 'going' || entry.status === 'attended';
  const firstBand = entry.concert.bands[0];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Bloque de fecha tipo "calendar tag" */}
      <View style={[styles.dateBox, isHighlight && styles.dateBoxActive]}>
        <Text
          style={{
            fontFamily: fontFamily.mono,
            fontSize: 9,
            letterSpacing: 1,
            color: isHighlight ? colors.bloodBright : colors.muted,
          }}
        >
          {month}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.displayBold,
            fontSize: 22,
            lineHeight: 24,
            color: colors.bright,
            marginTop: 2,
          }}
        >
          {day}
        </Text>
      </View>

      {/* Imagen banda */}
      <BandImage
        url={firstBand?.image_url ?? null}
        size={56}
        radiusOverride={radius.md}
        showTag={!firstBand?.image_url}
        style={{ marginLeft: spacing.md }}
      />

      {/* Contenido */}
      <View style={styles.cardContent}>
        <Text variant="displaySM" numberOfLines={1}>
          {entry.concert.bands.map((b) => b.name).join(' · ')}
        </Text>
        <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 4 }}>
          {entry.concert.venue.name}
          {entry.concert.venue.city ? ` · ${entry.concert.venue.city.toUpperCase()}` : ''}
        </Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isHighlight ? colors.bloodBright : colors.faint },
            ]}
          />
          <Text variant="monoSM" color={isHighlight ? 'bloodBright' : 'muted'}>
            {statusLabel[entry.status]}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
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
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  dateBox: {
    width: 52,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBoxActive: {
    borderColor: colors.bloodTintBorder,
    backgroundColor: colors.bloodTint,
  },
  cardContent: {
    flex: 1,
    marginLeft: spacing.md,
    minWidth: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
});
