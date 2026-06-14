import { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useFestival } from '../hooks/useFestival';
import { MapStackParamList } from '../navigation/MapStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';

type RouteParams = RouteProp<MapStackParamList, 'FestivalDetail'>;

function localeFromI18n(lng: string): string {
  if (lng.startsWith('en')) return 'en-US';
  return 'es-ES';
}

function formatDateRange(
  start: string,
  end: string,
  locale: string,
): { range: string; year: string } {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sameMonth = s.getMonth() === e.getMonth();

  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  const sMonth = monthFmt.format(s).toUpperCase().replace(/\./g, '');
  const eMonth = monthFmt.format(e).toUpperCase().replace(/\./g, '');

  if (sameMonth) {
    return {
      range: `${s.getDate()} – ${e.getDate()} ${sMonth}`,
      year: `${s.getFullYear()}`,
    };
  }
  return {
    range: `${s.getDate()} ${sMonth} – ${e.getDate()} ${eMonth}`,
    year: `${s.getFullYear()}`,
  };
}

export default function FestivalDetailScreen() {
  const route = useRoute<RouteParams>();
  const { t, i18n } = useTranslation();
  const { festival, loading, error } = useFestival(route.params.festivalId);

  const locale = localeFromI18n(i18n.language);

  const dateInfo = useMemo(() => {
    if (!festival) return null;
    return formatDateRange(festival.start_date, festival.end_date, locale);
  }, [festival, locale]);

  const headliners = useMemo(() => {
    if (!festival) return [];
    return festival.bands.filter((b) => b.is_headliner);
  }, [festival]);

  const followedBands = useMemo(() => {
    if (!festival) return [];
    return festival.bands.filter((b) => b.is_followed);
  }, [festival]);

  const otherBands = useMemo(() => {
    if (!festival) return [];
    return festival.bands.filter((b) => !b.is_followed && !b.is_headliner);
  }, [festival]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.bloodBright} size="large" />
      </View>
    );
  }

  if (error || !festival) {
    return (
      <View style={styles.centered}>
        <Text variant="bodyLG" color="muted" style={{ textAlign: 'center' }}>
          {error ?? t('festivalDetail.notFound')}
        </Text>
      </View>
    );
  }

  const isPast = new Date(festival.end_date) < new Date();
  const ctaUrl = festival.ticket_url ?? festival.official_url;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: ctaUrl ? 120 : spacing.xxxl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {festival.image_url ? (
            <Image source={{ uri: festival.image_url }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Ionicons name="musical-notes" size={64} color={colors.faint} />
            </View>
          )}
          <View style={styles.heroOverlay} />

          <View style={styles.festivalBadge}>
            <Ionicons name="flame" size={12} color={colors.bloodBright} />
            <Text variant="monoSM" color="bloodBright" style={{ marginLeft: 4 }}>
              {isPast ? t('festivalDetail.badgePast') : t('festivalDetail.badgeUpcoming')}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text variant="displayLG" style={{ marginBottom: spacing.sm }}>
            {festival.name}
          </Text>

          {dateInfo && (
            <View style={styles.dateStrip}>
              <View style={styles.dateBox}>
                <Text
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 10,
                    letterSpacing: 1,
                    color: colors.bloodBright,
                  }}
                >
                  {dateInfo.year}
                </Text>
                <Text
                  style={{
                    fontFamily: fontFamily.displayBold,
                    fontSize: 14,
                    color: colors.bright,
                    marginTop: 2,
                  }}
                >
                  {dateInfo.range}
                </Text>
              </View>
              <View style={styles.venueInfo}>
                <Text variant="monoSM" color="muted">
                  {t('festivalDetail.locationLabel')}
                </Text>
                <Text variant="body" numberOfLines={1} style={{ marginTop: 2 }}>
                  {festival.venue.name}
                </Text>
                <Text variant="bodySM" color="muted" numberOfLines={1}>
                  {festival.venue.city}
                  {festival.venue.country ? `, ${festival.venue.country}` : ''}
                </Text>
              </View>
            </View>
          )}

          {festival.description && (
            <View style={styles.section}>
              <Text variant="body" color="silver" style={{ lineHeight: 22 }}>
                {festival.description}
              </Text>
            </View>
          )}

          {followedBands.length > 0 && (
            <View style={styles.followedSummary}>
              <Ionicons name="heart" size={18} color={colors.bloodBright} />
              <Text variant="body" style={{ marginLeft: spacing.sm }}>
                {t('festivalDetail.followedSummary', { count: followedBands.length })}
              </Text>
            </View>
          )}

          {followedBands.length > 0 && (
            <View style={styles.section}>
              <Text variant="monoMD" color="bloodBright" style={styles.sectionTitle}>
                {t('festivalDetail.yourBandsTitle')}
              </Text>
              {followedBands.map((b) => (
                <View key={b.id} style={styles.bandRow}>
                  <BandImage url={b.image_url} size={44} showTag={!b.image_url} />
                  <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
                    <Text variant="displaySM" numberOfLines={1}>
                      {b.name}
                    </Text>
                    {b.is_headliner && (
                      <Text variant="monoSM" color="bloodBright" style={{ marginTop: 2 }}>
                        {t('festivalDetail.headlinerTag')}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="heart" size={18} color={colors.bloodBright} />
                </View>
              ))}
            </View>
          )}

          {headliners.filter((h) => !h.is_followed).length > 0 && (
            <View style={styles.section}>
              <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
                {t('festivalDetail.headlinersTitle')}
              </Text>
              {headliners
                .filter((h) => !h.is_followed)
                .map((b) => (
                  <View key={b.id} style={styles.bandRow}>
                    <BandImage url={b.image_url} size={44} showTag={!b.image_url} />
                    <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
                      <Text variant="displaySM" numberOfLines={1}>
                        {b.name}
                      </Text>
                      <Text variant="monoSM" color="bloodBright" style={{ marginTop: 2 }}>
                        {t('festivalDetail.headlinerTag')}
                      </Text>
                    </View>
                  </View>
                ))}
            </View>
          )}

          {otherBands.length > 0 && (
            <View style={styles.section}>
              <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
                {t('festivalDetail.fullLineupTitle', { count: otherBands.length })}
              </Text>
              <View style={styles.tagWrap}>
                {otherBands.map((b) => (
                  <View key={b.id} style={styles.tag}>
                    <Text variant="bodySM" color="silver">
                      {b.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {festival.official_url && (
            <TouchableOpacity
              style={styles.officialLink}
              onPress={() => Linking.openURL(festival.official_url!)}
              activeOpacity={0.7}
            >
              <Ionicons name="globe-outline" size={18} color={colors.silver} />
              <Text variant="body" color="silver" style={{ marginLeft: spacing.sm, flex: 1 }}>
                {t('festivalDetail.officialWebsite')}
              </Text>
              <Ionicons name="open-outline" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {ctaUrl && !isPast && (
        <View style={[styles.ctaWrapper, { paddingBottom: spacing.md }]}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => Linking.openURL(ctaUrl)}
            activeOpacity={0.85}
          >
            <Ionicons name="ticket" size={20} color="#fff" />
            <Text
              style={{
                fontFamily: fontFamily.displayBold,
                fontSize: 15,
                color: '#fff',
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginLeft: spacing.sm,
              }}
            >
              {t('festivalDetail.buyTickets')}
            </Text>
          </TouchableOpacity>
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
  hero: {
    width: '100%',
    height: 220,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: colors.ink,
    opacity: 0.6,
  },
  festivalBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,10,12,0.85)',
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  content: {
    padding: spacing.xl,
  },
  dateStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  dateBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.sm,
    alignItems: 'center',
    minWidth: 110,
  },
  venueInfo: {
    flex: 1,
    marginLeft: spacing.lg,
    minWidth: 0,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  followedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.full,
  },
  officialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  ctaWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.ink,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blood,
    borderRadius: radius.md,
    paddingVertical: 16,
  },
});
