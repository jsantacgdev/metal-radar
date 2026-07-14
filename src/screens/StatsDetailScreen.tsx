import { useMemo } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useProfileStats, StatsPeriod, StatsEntry } from '../hooks/useProfileStats';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';
import { localeFromI18n } from '../i18n';

export type StatsDetailKind =
  | 'events'
  | 'concerts'
  | 'festivals'
  | 'bands'
  | 'cities'
  | 'km'
  | 'topBand'
  | 'topGenre'
  | 'bestYear';

export type StatsDetailParams = {
  kind: StatsDetailKind;
  period: StatsPeriod;
  year?: number;
};

type Params = RouteProp<{ StatsDetail: StatsDetailParams }, 'StatsDetail'>;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function capitalizeWords(text: string): string {
  return text
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function StatsDetailScreen() {
  const route = useRoute<Params>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = localeFromI18n(i18n.language);

  const { kind, period, year } = route.params;
  const targetYear = year ?? new Date().getFullYear();

  const { entries, stats, homeLat, homeLng, loading } = useProfileStats(period, targetYear);

  const title = useMemo(() => {
    switch (kind) {
      case 'events':
        return t('statsDetail.titleEvents');
      case 'concerts':
        return t('statsDetail.titleConcerts');
      case 'festivals':
        return t('statsDetail.titleFestivals');
      case 'bands':
        return t('statsDetail.titleBands');
      case 'cities':
        return t('statsDetail.titleCities');
      case 'km':
        return t('statsDetail.titleKm');
      case 'topBand':
        return t('statsDetail.titleTopBand');
      case 'topGenre':
        return t('statsDetail.titleTopGenre');
      case 'bestYear':
        return t('statsDetail.titleBestYear');
    }
  }, [kind, t]);

  return (
    <View style={styles.container}>
      {/* Header custom */}
      <View
        style={[
          styles.customHeader,
          {
            paddingTop: insets.top,
            height: 40 + insets.top,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={10}
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Text style={styles.customHeaderTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ height: 40 + insets.top }} />

      {loading ? (
        <View style={styles.centered}>
          <Text variant="bodySM" color="muted">
            {t('common.loading')}
          </Text>
        </View>
      ) : (
        <ContentByKind
          kind={kind}
          entries={entries}
          stats={stats}
          homeLat={homeLat}
          homeLng={homeLng}
          locale={locale}
          navigation={navigation}
          t={t}
        />
      )}
    </View>
  );
}

/* ---------- Content por tipo ---------- */

function ContentByKind({
  kind,
  entries,
  stats,
  homeLat,
  homeLng,
  locale,
  navigation,
  t,
}: {
  kind: StatsDetailKind;
  entries: StatsEntry[];
  stats: ReturnType<typeof useProfileStats>['stats'];
  homeLat: number | null;
  homeLng: number | null;
  locale: string;
  navigation: NativeStackNavigationProp<any>;
  t: (k: string, opts?: any) => string;
}) {
  if (kind === 'events') {
    return <EventList entries={entries} navigation={navigation} locale={locale} t={t} />;
  }
  if (kind === 'concerts' || kind === 'festivals') {
    const filtered = entries.filter(
      (e) => e.kind === (kind === 'concerts' ? 'concert' : 'festival'),
    );
    return <EventList entries={filtered} navigation={navigation} locale={locale} t={t} />;
  }

  if (kind === 'bands') {
    const bandMap = new Map<
      string,
      {
        id: string;
        name: string;
        image_url: string | null;
        count: number;
        festivals: Set<string>;
      }
    >();
    entries.forEach((e) => {
      e.bands.forEach((b) => {
        const ex = bandMap.get(b.id);
        if (ex) {
          ex.count++;
          if (e.kind === 'festival' && e.parent_name) ex.festivals.add(e.parent_name);
        } else {
          bandMap.set(b.id, {
            id: b.id,
            name: b.name,
            image_url: b.image_url,
            count: 1,
            festivals:
              e.kind === 'festival' && e.parent_name ? new Set([e.parent_name]) : new Set(),
          });
        }
      });
    });
    const bands = Array.from(bandMap.values())
      .map((b) => ({
        ...b,
        festivals: Array.from(b.festivals),
      }))
      .sort((a, b) => b.count - a.count);
    return <BandList bands={bands} navigation={navigation} t={t} />;
  }

  if (kind === 'cities') {
    const cityMap = new Map<string, { concerts: number; festivals: number }>();
    entries.forEach((e) => {
      if (!e.city) return;
      const ex = cityMap.get(e.city) ?? { concerts: 0, festivals: 0 };
      if (e.kind === 'concert') ex.concerts++;
      else ex.festivals++;
      cityMap.set(e.city, ex);
    });
    const cities = Array.from(cityMap.entries())
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.concerts + b.festivals - (a.concerts + a.festivals));
    return <CityList cities={cities} t={t} />;
  }

  if (kind === 'km') {
    const withDist = entries
      .filter((e) => e.lat != null && e.lng != null && homeLat != null && homeLng != null)
      .map((e) => ({
        entry: e,
        distance: haversineKm(homeLat!, homeLng!, e.lat!, e.lng!),
      }))
      .sort((a, b) => b.distance - a.distance);

    return (
      <FlatList
        data={withDist}
        keyExtractor={(item) => item.entry.raw_id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <EventRow
            entry={item.entry}
            navigation={navigation}
            locale={locale}
            rightAccessory={
              <Text variant="monoSM" color="bloodBright">
                {Math.round(item.distance)} km
              </Text>
            }
          />
        )}
      />
    );
  }

  if (kind === 'topBand') {
    const bandMap = new Map<
      string,
      {
        id: string;
        name: string;
        image_url: string | null;
        count: number;
        festivals: Set<string>;
      }
    >();
    entries.forEach((e) => {
      e.bands.forEach((b) => {
        const ex = bandMap.get(b.id);
        if (ex) {
          ex.count++;
          if (e.kind === 'festival' && e.parent_name) ex.festivals.add(e.parent_name);
        } else {
          bandMap.set(b.id, {
            id: b.id,
            name: b.name,
            image_url: b.image_url,
            count: 1,
            festivals:
              e.kind === 'festival' && e.parent_name ? new Set([e.parent_name]) : new Set(),
          });
        }
      });
    });
    const topBands = Array.from(bandMap.values())
      .map((b) => ({
        ...b,
        festivals: Array.from(b.festivals),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    return <BandList bands={topBands} navigation={navigation} t={t} showRanking />;
  }

  if (kind === 'topGenre') {
    const genreMap = new Map<string, number>();
    entries.forEach((e) => {
      e.bands.forEach((b) => {
        b.genres.forEach((g) => {
          genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
        });
      });
    });
    const genres = Array.from(genreMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    return (
      <FlatList
        data={genres}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <View style={styles.rankCircle}>
              <Text variant="monoSM" color="bloodBright">
                {index + 1}
              </Text>
            </View>
            <Text variant="body" style={{ flex: 1, marginLeft: spacing.md }}>
              {capitalizeWords(item.name)}
            </Text>
            <Text variant="monoSM" color="silver">
              {t('statsDetail.appearanceCount', { count: item.count })}
            </Text>
          </View>
        )}
      />
    );
  }

  if (kind === 'bestYear') {
    if (!stats.bestYear) {
      return (
        <View style={styles.centered}>
          <Text variant="bodySM" color="muted">
            {t('statsDetail.noData')}
          </Text>
        </View>
      );
    }
    const yearStart = new Date(`${stats.bestYear.year}-01-01T00:00:00Z`).getTime();
    const yearEnd = new Date(`${stats.bestYear.year + 1}-01-01T00:00:00Z`).getTime();
    const ofThatYear = entries.filter((e) => {
      const tt = new Date(e.event_date).getTime();
      return tt >= yearStart && tt < yearEnd;
    });
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.yearBanner}>
          <Text
            style={{
              fontFamily: fontFamily.displayBold,
              fontSize: 56,
              lineHeight: 68,
              color: colors.bloodBright,
              letterSpacing: -1,
              paddingVertical: 4,
            }}
          >
            {stats.bestYear.year}
          </Text>
        </View>
        <EventList entries={ofThatYear} navigation={navigation} locale={locale} t={t} />
      </View>
    );
  }

  return null;
}

/* ---------- Subcomponentes ---------- */

function EventList({
  entries,
  navigation,
  locale,
  t,
}: {
  entries: StatsEntry[];
  navigation: NativeStackNavigationProp<any>;
  locale: string;
  t: (k: string, opts?: any) => string;
}) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime(),
  );
  return (
    <FlatList
      data={sorted}
      keyExtractor={(item) => item.raw_id}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text variant="bodySM" color="muted">
            {t('statsDetail.noData')}
          </Text>
        </View>
      }
      renderItem={({ item }) => <EventRow entry={item} navigation={navigation} locale={locale} />}
    />
  );
}

function EventRow({
  entry,
  navigation,
  locale,
  rightAccessory,
}: {
  entry: StatsEntry;
  navigation: NativeStackNavigationProp<any>;
  locale: string;
  rightAccessory?: React.ReactNode;
}) {
  const date = new Date(entry.event_date);
  const dateLabel = date
    .toLocaleDateString(locale, { day: '2-digit', month: 'short', year: '2-digit' })
    .toUpperCase()
    .replace(/\./g, '');

  const handlePress = () => {
    if (entry.kind === 'festival') {
      navigation.navigate('FestivalDetail', { festivalId: entry.parent_id });
    } else {
      navigation.navigate('ConcertDetail', { concertId: entry.parent_id });
    }
  };

  const title =
    entry.kind === 'festival' && entry.parent_name
      ? entry.parent_name
      : (entry.bands[0]?.name ?? '—');

  return (
    <TouchableOpacity style={styles.row} onPress={handlePress} activeOpacity={0.7}>
      <BandImage
        url={
          entry.kind === 'festival'
            ? (entry.image_url ?? null)
            : (entry.bands[0]?.image_url ?? null)
        }
        size={44}
        showTag={entry.kind === 'festival' ? !entry.image_url : !entry.bands[0]?.image_url}
      />
      <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
        <Text variant="displaySM" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 4 }}>
          {entry.venue_name}
          {entry.city ? ` · ${entry.city.toUpperCase()}` : ''}
        </Text>
      </View>
      {rightAccessory ?? (
        <Text variant="monoSM" color="silver">
          {dateLabel}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function BandList({
  bands,
  navigation,
  t,
  showRanking,
}: {
  bands: {
    id: string;
    name: string;
    image_url: string | null;
    count: number;
    festivals: string[];
  }[];
  navigation: NativeStackNavigationProp<any>;
  t: (k: string, opts?: any) => string;
  showRanking?: boolean;
}) {
  return (
    <FlatList
      data={bands}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text variant="bodySM" color="muted">
            {t('statsDetail.noData')}
          </Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('BandDetail', { bandId: item.id })}
          activeOpacity={0.7}
        >
          {showRanking && (
            <View style={styles.rankCircle}>
              <Text variant="monoSM" color="bloodBright">
                {index + 1}
              </Text>
            </View>
          )}
          <BandImage url={item.image_url} size={44} showTag={!item.image_url} />
          <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
            <Text variant="displaySM" numberOfLines={1}>
              {item.name}
            </Text>
            {item.festivals.length > 0 && (
              <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 4 }}>
                {item.festivals.join(' · ')}
              </Text>
            )}
          </View>
          <Text variant="monoSM" color="bloodBright">
            {item.count}x
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

function CityList({
  cities,
  t,
}: {
  cities: { name: string; concerts: number; festivals: number }[];
  t: (k: string, opts?: any) => string;
}) {
  return (
    <FlatList
      data={cities}
      keyExtractor={(item) => item.name}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text variant="bodySM" color="muted">
            {t('statsDetail.noData')}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.cityIcon}>
            <Ionicons name="location" size={18} color={colors.bloodBright} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text variant="displaySM">{item.name.toUpperCase()}</Text>
            <Text variant="monoSM" color="muted" style={{ marginTop: 2 }}>
              {item.concerts > 0 && t('statsDetail.cityConcerts', { count: item.concerts })}
              {item.concerts > 0 && item.festivals > 0 && ' · '}
              {item.festivals > 0 && t('statsDetail.cityFestivals', { count: item.festivals })}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  customHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingBottom: 6,
    backgroundColor: colors.ink,
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  customHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.bright,
    fontFamily: fontFamily.displayBold,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  cityIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearBanner: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
});
