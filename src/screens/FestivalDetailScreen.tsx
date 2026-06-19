import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Linking,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useFestival } from '../hooks/useFestival';
import { MapStackParamList } from '../navigation/MapStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';
import { localeFromI18n } from '../i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import PhotoGallery from '../components/PhotoGallery';
import FestivalDetailSkeleton from '../components/skeletons/FestivalDetailSkeleton';

type RouteParams = RouteProp<MapStackParamList, 'FestivalDetail'>;

const HERO_HEIGHT = 280;

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
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { t, i18n } = useTranslation();
  const { festival, loading, error, updateStatus, updateRating, updateNotes } = useFestival(
    route.params.festivalId,
  );

  const locale = localeFromI18n(i18n.language);

  const scrollY = useRef(new Animated.Value(0)).current;

  const heroTranslateY = scrollY.interpolate({
    inputRange: [-HERO_HEIGHT, 0, HERO_HEIGHT],
    outputRange: [0, 0, -HERO_HEIGHT * 0.5],
    extrapolateRight: 'clamp',
  });

  const heroScale = scrollY.interpolate({
    inputRange: [-HERO_HEIGHT, 0, HERO_HEIGHT],
    outputRange: [1.5, 1, 1],
    extrapolateRight: 'clamp',
  });

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
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FestivalDetailSkeleton />
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
  const isAttended = festival.userStatus === 'attended';

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: ctaUrl ? 120 : spacing.xxxl }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
      >
        <Animated.View
          style={[
            styles.hero,
            {
              transform: [{ translateY: heroTranslateY }, { scale: heroScale }],
            },
          ]}
        >
          {festival.image_url ? (
            <Image source={{ uri: festival.image_url }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <View style={styles.placeholderCircle}>
                <Text
                  style={{
                    fontFamily: fontFamily.displayBold,
                    fontSize: 56,
                    color: colors.bloodBright,
                    lineHeight: 64,
                  }}
                >
                  {festival.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Ionicons
                name="flame"
                size={20}
                color={colors.bloodBright}
                style={{ marginTop: spacing.md, opacity: 0.6 }}
              />
            </View>
          )}

          <LinearGradient
            colors={['transparent', 'rgba(10,10,12,0.4)', colors.ink]}
            locations={[0.2, 0.6, 1]}
            style={styles.heroGradient}
            pointerEvents="none"
          />

          <View style={styles.festivalBadge}>
            <Ionicons name="flame" size={12} color={colors.bloodBright} />
            <Text variant="monoSM" color="bloodBright" style={{ marginLeft: 4 }}>
              {isPast ? t('festivalDetail.badgePast') : t('festivalDetail.badgeUpcoming')}
            </Text>
          </View>
        </Animated.View>

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

          <View style={styles.section}>
            <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
              {isPast ? t('festivalDetail.attendanceTitle') : t('festivalDetail.statusTitle')}
            </Text>
            <View style={styles.actionsRow}>
              {!isPast && (
                <>
                  <ActionPill
                    label={t('festivalDetail.statusInterested')}
                    active={festival.userStatus === 'interested'}
                    onPress={() =>
                      updateStatus(festival.userStatus === 'interested' ? null : 'interested')
                    }
                  />
                  <ActionPill
                    label={t('festivalDetail.statusGoing')}
                    active={festival.userStatus === 'going'}
                    highlight
                    onPress={() => updateStatus(festival.userStatus === 'going' ? null : 'going')}
                  />
                </>
              )}
              <ActionPill
                label={t('festivalDetail.statusAttended')}
                active={festival.userStatus === 'attended'}
                highlight
                onPress={() => updateStatus(festival.userStatus === 'attended' ? null : 'attended')}
              />
            </View>
          </View>

          {isAttended && festival.userFestivalId && (
            <>
              <View style={styles.section}>
                <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
                  {t('concertDetail.ratingTitle')}
                </Text>
                <RatingPicker
                  value={festival.rating ?? 0}
                  onChange={(v) => updateRating(v === festival.rating ? null : v)}
                />
              </View>

              <View style={styles.section}>
                <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
                  {t('concertDetail.notesTitle')}
                </Text>
                <NotesEditor
                  initialValue={festival.notes ?? ''}
                  onSave={(text) => updateNotes(text)}
                />
              </View>

              <View style={styles.section}>
                <PhotoGallery kind="festival" userFestivalId={festival.userFestivalId} />
              </View>
            </>
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
                <TouchableOpacity
                  key={b.id}
                  style={styles.bandRow}
                  onPress={() => navigation.navigate('BandDetail', { bandId: b.id })}
                  activeOpacity={0.7}
                >
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
                </TouchableOpacity>
              ))}
            </View>
          )}

          {headliners
            .filter((h) => !h.is_followed)
            .map((b) => (
              <TouchableOpacity
                key={b.id}
                style={styles.bandRow}
                onPress={() => navigation.navigate('BandDetail', { bandId: b.id })}
                activeOpacity={0.7}
              >
                <BandImage url={b.image_url} size={44} showTag={!b.image_url} />
                <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
                  <Text variant="displaySM" numberOfLines={1}>
                    {b.name}
                  </Text>
                  <Text variant="monoSM" color="bloodBright" style={{ marginTop: 2 }}>
                    {t('festivalDetail.headlinerTag')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

          {otherBands.length > 0 && (
            <View style={styles.section}>
              <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
                {t('festivalDetail.fullLineupTitle', { count: otherBands.length })}
              </Text>
              <View style={styles.tagWrap}>
                {otherBands.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.tag}
                    onPress={() => navigation.navigate('BandDetail', { bandId: b.id })}
                    activeOpacity={0.7}
                  >
                    <Text variant="bodySM" color="silver">
                      {b.name}
                    </Text>
                  </TouchableOpacity>
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
      </Animated.ScrollView>

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

function ActionPill({
  label,
  active,
  highlight,
  onPress,
}: {
  label: string;
  active: boolean;
  highlight?: boolean;
  onPress: () => void;
}) {
  const bg = active ? (highlight ? colors.blood : colors.silver) : 'transparent';
  const border = active ? (highlight ? colors.bloodBright : colors.silver) : colors.line;
  const textColor = active ? (highlight ? '#fff' : colors.ink) : colors.silver;

  return (
    <TouchableOpacity
      style={[styles.actionPill, { backgroundColor: bg, borderColor: border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: fontFamily.mono,
          fontSize: 11,
          lineHeight: 13,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: textColor,
          includeFontPadding: false,
          textAlignVertical: 'center',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function RatingPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.ratingRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <TouchableOpacity
          key={i}
          onPress={() => onChange(i)}
          activeOpacity={0.6}
          hitSlop={8}
          style={styles.ratingTouch}
        >
          <Ionicons name="star" size={26} color={i <= value ? colors.bloodBright : colors.faint} />
        </TouchableOpacity>
      ))}
      <View style={{ flex: 1 }} />
      {value > 0 && (
        <Text variant="monoSM" color="silver">
          {value}/5
        </Text>
      )}
    </View>
  );
}

function NotesEditor({
  initialValue,
  onSave,
}: {
  initialValue: string;
  onSave: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialValue);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setText(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (text === initialValue) return;
    const tm = setTimeout(() => onSave(text), 800);
    return () => clearTimeout(tm);
  }, [text, initialValue, onSave]);

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={setText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (text !== initialValue) onSave(text);
        }}
        placeholder={t('concertDetail.notesPlaceholder')}
        placeholderTextColor={colors.muted}
        multiline
        scrollEnabled={false}
        style={[styles.notesInput, focused && { borderColor: colors.bloodBright }]}
      />
      {text.length > 0 && (
        <Text variant="monoSM" color="muted" style={{ marginTop: 6, textAlign: 'right' }}>
          {t('concertDetail.charactersCount', { count: text.length })}
        </Text>
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
    height: HERO_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 0.75,
    position: 'absolute',
    top: 0,
    left: 0,
    resizeMode: 'cover',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
  },
  heroPlaceholder: {
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.bloodTint,
    borderWidth: 2,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  festivalBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.xl,
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
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ratingTouch: {
    paddingVertical: 4,
  },
  notesInput: {
    minHeight: 100,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    color: colors.bright,
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
});
