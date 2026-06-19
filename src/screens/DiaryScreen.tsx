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
import { useTranslation } from 'react-i18next';
import { DiaryEntry, useDiary } from '../hooks/useDiary';
import { useDiaryStats } from '../hooks/useDiaryStats';
import { useUpdateConcertStatus } from '../hooks/useUpdateConcertStatus';
import { DiaryStackParamList } from '../navigation/DiaryStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';
import { localeFromI18n } from '../i18n';
import EmptyState from '../components/EmptyState';
import DiarySkeleton from '../components/skeletons/DiarySkeleton';

type Filter = 'upcoming' | 'past';

const CURRENT_YEAR = new Date().getFullYear();

export default function DiaryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<DiaryStackParamList>>();
  const { t, i18n } = useTranslation();
  const { entries, loading, error, reload } = useDiary();
  const stats = useDiaryStats(entries, CURRENT_YEAR);
  const [filter, setFilter] = useState<Filter>('upcoming');

  const locale = localeFromI18n(i18n.language);

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

  const showWrappedBanner = filter === 'past' && stats.shows > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text variant="monoMD" color="muted">
          {t('diary.headerEyebrow')}
        </Text>
        <Text variant="displayLG" style={{ marginTop: 4 }}>
          {t('diary.title')}
        </Text>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <StatCard value={stats.shows.toString()} label={t('diary.statShows')} accent />
        <StatCard value={stats.bands.toString()} label={t('diary.statBands')} />
        <StatCard value={CURRENT_YEAR.toString()} label={t('diary.statYear')} />
      </View>

      <View style={styles.tabsRow}>
        <TabPill
          label={`${t('diary.tabUpcoming')} · ${upcoming.length}`}
          active={filter === 'upcoming'}
          onPress={() => setFilter('upcoming')}
        />
        <TabPill
          label={`${t('diary.tabPast')} · ${past.length}`}
          active={filter === 'past'}
          onPress={() => setFilter('past')}
        />
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
            <Text variant="displaySM">{t('diary.wrappedTitle', { year: CURRENT_YEAR })}</Text>
            <Text variant="monoSM" color="muted" style={{ marginTop: 2 }}>
              {t('diary.wrappedKm', { km: stats.km.toLocaleString(locale) })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.silver} />
        </TouchableOpacity>
      )}

      <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
        {filter === 'upcoming' ? t('diary.upcomingTitle') : t('diary.recent')}
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text variant="bodySM" color="bloodBright">
            {error}
          </Text>
        </View>
      )}

      {loading && entries.length === 0 ? (
        <DiarySkeleton />
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <EmptyState
            icon={filter === 'upcoming' ? 'calendar-outline' : 'book-outline'}
            title={
              filter === 'upcoming' ? t('diary.emptyUpcomingTitle') : t('diary.emptyPastTitle')
            }
            description={
              filter === 'upcoming' ? t('diary.emptyUpcomingDesc') : t('diary.emptyPastDesc')
            }
            actionLabel={filter === 'upcoming' ? t('diary.emptyUpcomingCta') : undefined}
            onAction={
              filter === 'upcoming'
                ? () => navigation.getParent()?.navigate('MapTab' as never)
                : undefined
            }
          />
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
              locale={locale}
              onPress={() => {
                if (item.kind === 'festival') {
                  navigation.navigate('FestivalDetail', { festivalId: item.concert_id });
                } else {
                  navigation.navigate('ConcertDetail', { concertId: item.concert_id });
                }
              }}
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
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name="star"
          size={9}
          color={i <= rating ? colors.bloodBright : colors.faint}
        />
      ))}
    </View>
  );
}

function DiaryItem({
  entry,
  locale,
  onPress,
}: {
  entry: DiaryEntry;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const date = new Date(entry.concert.event_date);
  const updateStatus = useUpdateConcertStatus();
  const firstBand = entry.concert.bands[0];

  const dateLabel = date
    .toLocaleDateString(locale, {
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
        url={
          entry.kind === 'festival'
            ? (entry.concert.image_url ?? null)
            : (firstBand?.image_url ?? null)
        }
        size={48}
        radiusOverride={radius.sm}
        showTag={entry.kind === 'festival' ? !entry.concert.image_url : !firstBand?.image_url}
      />

      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          {entry.kind === 'festival' && (
            <Ionicons name="flame" size={14} color="#ffa500" style={{ marginRight: 6 }} />
          )}
          <Text variant="displaySM" numberOfLines={1} style={{ flex: 1 }}>
            {entry.kind === 'festival' && entry.concert.festival_name
              ? entry.concert.festival_name
              : (entry.concert.bands[0]?.name ?? t('concertDetail.noBand'))}
          </Text>
          <Text variant="monoSM" color="muted" style={{ marginLeft: spacing.sm }}>
            {dateLabel}
          </Text>
        </View>

        <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 4 }}>
          {entry.kind === 'festival'
            ? entry.concert.bands
                .slice(0, 3)
                .map((b) => b.name)
                .join(' · ')
            : `${entry.concert.venue.name}${
                entry.concert.venue.city ? ` · ${entry.concert.venue.city.toUpperCase()}` : ''
              }`}
        </Text>

        {entry.status === 'attended' && (
          <View style={styles.metaRow}>
            <RatingTriangles rating={entry.rating ?? 0} />
          </View>
        )}

        {isPastGoing && (
          <View style={styles.confirmRow}>
            <Text variant="monoSM" color="silver" style={{ marginRight: spacing.sm }}>
              {t('diary.didYouGo')}
            </Text>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmBtnYes]}
              onPress={handleConfirmAttended}
              activeOpacity={0.8}
              disabled={updateStatus.isPending}
            >
              <Text variant="monoSM" style={{ color: colors.ink }}>
                {t('diary.confirmYes')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirmNotAttended}
              activeOpacity={0.8}
              disabled={updateStatus.isPending}
            >
              <Text variant="monoSM" color="silver">
                {t('diary.confirmNo')}
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
