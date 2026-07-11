import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConcert } from '../hooks/useConcert';
import { useReportConcert } from '../hooks/useReportConcert';
import { MapStackParamList } from '../navigation/MapStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';
import PhotoGallery from '../components/PhotoGallery';
import ReportReasonModal from '../components/ReportReasonModal';
import WhoIsGoingRow from '../components/WhoIsGoingRow';
import RatingStatsRow from '../components/RatingStatsRow';
import CommentsSection from '../components/CommentsSection';
import SetlistView from '../components/Setlist';
import { useSetlists } from '../hooks/useSetlist';
import { localeFromI18n } from '../i18n';
import { addEventToCalendar } from '../lib/calendar';
import ConcertDetailSkeleton from '../components/skeletons/ConcertDetailSkeleton';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<MapStackParamList, 'ConcertDetail'>;

const HERO_MAX_HEIGHT = 200;
const HERO_MIN_HEIGHT = 0;
const HERO_SCROLL_DISTANCE = HERO_MAX_HEIGHT - HERO_MIN_HEIGHT;
const HEADER_HEIGHT = 0;

export default function ConcertDetailScreen({ route }: Props) {
  const { t, i18n } = useTranslation();
  const { concertId } = route.params;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList>>();

  const { concert, loading, error, updateStatus, updateRating, updateNotes } =
    useConcert(concertId);
  const reportConcert = useReportConcert(concertId);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const { data: setlists = [] } = useSetlists(concert ? concert.id : null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;

  const heroHeight = scrollY.interpolate({
    inputRange: [0, HERO_SCROLL_DISTANCE],
    outputRange: [HERO_MAX_HEIGHT, HERO_MIN_HEIGHT],
    extrapolate: 'clamp',
  });

  const heroContentOpacity = scrollY.interpolate({
    inputRange: [0, HERO_SCROLL_DISTANCE * 0.5, HERO_SCROLL_DISTANCE],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const imageScale = scrollY.interpolate({
    inputRange: [0, HERO_SCROLL_DISTANCE],
    outputRange: [1, 0.4],
    extrapolate: 'clamp',
  });

  const imageTranslateY = scrollY.interpolate({
    inputRange: [0, HERO_SCROLL_DISTANCE],
    outputRange: [0, -40],
    extrapolate: 'clamp',
  });

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [HERO_SCROLL_DISTANCE * 0.4, HERO_SCROLL_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const opacity = Math.min(
        Math.max((value - HERO_SCROLL_DISTANCE * 0.6) / (HERO_SCROLL_DISTANCE * 0.4), 0),
        1,
      );
      titleOpacity.setValue(opacity);
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, titleOpacity]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <ConcertDetailSkeleton />
      </View>
    );
  }

  if (error || !concert) {
    return (
      <View style={styles.centered}>
        <Text variant="body" color="bloodBright" style={{ textAlign: 'center' }}>
          {error ?? t('concertDetail.notFound')}
        </Text>
      </View>
    );
  }

  const isAttended = concert.userStatus === 'attended';
  const locale = localeFromI18n(i18n.language);
  const dateObj = new Date(concert.event_date);
  const month = dateObj
    .toLocaleDateString(locale, { month: 'short' })
    .toUpperCase()
    .replace('.', '');
  const day = dateObj.getDate().toString();
  const weekday = dateObj.toLocaleDateString(locale, { weekday: 'long' }).toUpperCase();
  const fullDate = dateObj.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = dateObj.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const isPast = dateObj.getTime() < Date.now();

  const headliner = concert.bands.find((b) => b.is_headliner) ?? concert.bands[0];
  const headerTitle = headliner?.name ?? t('concertDetail.noBand');

  const openTickets = () => {
    if (concert.ticket_url) Linking.openURL(concert.ticket_url);
  };

  const handleReport = () => {
    setReportModalOpen(true);
  };

  const handleReportSubmit = async (reason: string | null) => {
    try {
      await reportConcert.mutateAsync(reason ?? undefined);
      Alert.alert(t('concertDetail.reportThanks'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleShare = async () => {
    const bandName = headliner?.name ?? t('concertDetail.noBand');
    const dateText = dateObj.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
    });
    const place = concert.venue.city ?? concert.venue.name;

    const message = t('concertDetail.shareMessage', {
      band: bandName,
      date: dateText,
      place,
    });

    try {
      await Share.share({
        message: concert.ticket_url ? `${message}\n\n${concert.ticket_url}` : message,
      });
    } catch (err: any) {
      console.warn('Share error:', err.message);
    }
  };

  const handleAddToCalendar = async () => {
    const bandName = headliner?.name ?? t('concertDetail.noBand');
    const title = t('calendar.eventTitle', { band: bandName });
    const location = [concert.venue.name, concert.venue.city, concert.venue.country]
      .filter(Boolean)
      .join(', ');
    const lineup = concert.bands.map((b) => b.name).join(', ');
    const notes = t('calendar.eventNotes', { lineup });

    const [year, month, day] = concert.event_date.split('T')[0].split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 0));

    await addEventToCalendar({
      title,
      startDate,
      endDate,
      location,
      notes,
      url: concert.ticket_url ?? undefined,
      allDay: true,
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.ink }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header custom compacto */}
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
        >
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Animated.Text
          style={[styles.customHeaderTitle, { opacity: titleOpacity }]}
          numberOfLines={1}
        >
          {headerTitle}
        </Animated.Text>
        <View style={{ width: 40 }} />
      </View>

      {/* HERO COLAPSABLE FIJO ARRIBA */}
      <Animated.View
        style={[
          styles.heroContainer,
          {
            top: HEADER_HEIGHT + insets.top,
            height: heroHeight,
          },
        ]}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: colors.ink,
              opacity: headerBgOpacity,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            },
          ]}
        />

        <Animated.View
          style={[styles.heroContent, { opacity: heroContentOpacity }]}
          pointerEvents="none"
        >
          <Animated.View
            style={{
              transform: [{ scale: imageScale }, { translateY: imageTranslateY }],
            }}
          >
            <BandImage
              url={headliner?.image_url ?? null}
              size={130}
              radiusOverride={radius.lg}
              showTag={!headliner?.image_url}
            />
          </Animated.View>
          <View style={styles.heroText}>
            <Text variant="monoMD" color="bloodBright">
              {isPast ? t('concertDetail.pastConcert') : t('concertDetail.upcomingConcert')}
            </Text>
            <Text
              variant="displayLG"
              style={{ marginTop: spacing.sm }}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {headerTitle}
            </Text>
            {concert.bands.length > 1 && (
              <Text variant="monoSM" color="silver" style={{ marginTop: 6 }} numberOfLines={1}>
                {t('concertDetail.moreBands', { count: concert.bands.length - 1 })}
              </Text>
            )}
          </View>
        </Animated.View>
      </Animated.View>

      {/* SCROLLABLE CONTENT */}
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: HERO_MAX_HEIGHT + HEADER_HEIGHT + insets.top,
          paddingBottom: 140,
        }}
        keyboardShouldPersistTaps="handled"
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
      >
        <View style={styles.metaStrip}>
          <View style={styles.dateBox}>
            <Text
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 10,
                letterSpacing: 1,
                color: colors.bloodBright,
              }}
            >
              {month}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.displayBold,
                fontSize: 26,
                lineHeight: 28,
                color: colors.bright,
              }}
            >
              {day}
            </Text>
          </View>
          <View style={styles.metaInfo}>
            <Text variant="displaySM" numberOfLines={1}>
              {concert.venue.name}
            </Text>
            <Text variant="monoSM" color="muted" style={{ marginTop: 4 }} numberOfLines={1}>
              {concert.venue.city ? `${concert.venue.city.toUpperCase()} · ` : ''}
              {t('concertDetail.timeFormat', { time: timeStr })}
            </Text>
            <Text variant="monoSM" color="silver" style={{ marginTop: 4 }} numberOfLines={1}>
              {weekday} · {fullDate}
            </Text>
          </View>
        </View>

        <Section
          title={isPast ? t('concertDetail.attendanceTitle') : t('concertDetail.statusTitle')}
        >
          <View style={styles.actionsRow}>
            {!isPast && (
              <>
                <ActionPill
                  label={t('concertDetail.statusInterested')}
                  active={concert.userStatus === 'interested'}
                  onPress={() =>
                    updateStatus(concert.userStatus === 'interested' ? null : 'interested')
                  }
                />
                <ActionPill
                  label={t('concertDetail.statusGoing')}
                  active={concert.userStatus === 'going'}
                  highlight
                  onPress={() => updateStatus(concert.userStatus === 'going' ? null : 'going')}
                />
              </>
            )}
            <ActionPill
              label={t('concertDetail.statusAttended')}
              active={concert.userStatus === 'attended'}
              highlight
              onPress={() => updateStatus(concert.userStatus === 'attended' ? null : 'attended')}
            />
          </View>
        </Section>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.md }}>
          <WhoIsGoingRow
            targetType="concert"
            targetId={concert.id}
            onPress={() => navigation.navigate('WhoIsGoing', { targetType: 'concert', targetId: concert.id })}
          />
        </View>

        <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
          <RatingStatsRow targetType="concert" targetId={concert.id} />
        </View>

        {(concert.price_min ?? concert.price_max) != null && (
          <Section title={t('concertDetail.priceTitle')}>
            <Text variant="displaySM">
              {concert.price_min === concert.price_max
                ? `${concert.price_min} ${concert.currency}`
                : `${concert.price_min ?? '?'} – ${concert.price_max ?? '?'} ${concert.currency ?? ''}`}
            </Text>
          </Section>
        )}

        {concert.bands.length > 0 && (
          <Section title={t('concertDetail.lineupTitle')}>
            {concert.bands.map((b, i) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.bandRow, i === concert.bands.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => navigation.navigate('BandDetail', { bandId: b.id })}
                activeOpacity={0.7}
              >
                <BandImage url={b.image_url} size={44} showTag={!b.image_url} />
                <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
                  <Text variant="displaySM" numberOfLines={1}>
                    {b.name}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </Section>
        )}

        <View style={{ paddingHorizontal: spacing.xl }}>
          {(() => {
            if (!headliner) return null;
            const setlist = setlists.find((s) => s.band_id === headliner.id) ?? null;
            return (
              <SetlistView
                key={headliner.id}
                concertId={concert.id}
                setlist={setlist}
                bandId={headliner.id}
                bandName={headliner.name}
              />
            );
          })()}
        </View>

        {isAttended && concert.userConcertId && (
          <>
            <Section title={t('concertDetail.ratingTitle')}>
              <RatingPicker
                value={concert.rating ?? 0}
                onChange={(v) => updateRating(v === concert.rating ? null : v)}
              />
            </Section>

            <Section title={t('concertDetail.notesTitle')}>
              <NotesEditor
                initialValue={concert.notes ?? ''}
                onSave={(text) => updateNotes(text)}
              />
            </Section>

            <View style={styles.gallerySection}>
              <PhotoGallery kind="concert" userConcertId={concert.userConcertId} />
            </View>
          </>
        )}

        <CommentsSection targetType="concert" targetId={concert.id} />

        {concert.status !== 'onsale' && (
          <View style={styles.statusBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.bloodBright} />
            <Text variant="monoSM" color="bloodBright" style={{ marginLeft: 8 }}>
              {t('concertDetail.statusBanner', { status: concert.status.toUpperCase() })}
            </Text>
          </View>
        )}

        {concert.source === 'user_submitted' && (
          <TouchableOpacity
            onPress={handleReport}
            disabled={reportConcert.isPending}
            style={styles.reportBtn}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons name="flag-outline" size={14} color={colors.muted} />
            <Text variant="monoSM" color="muted" style={{ marginLeft: 6 }}>
              {t('concertDetail.reportButton')}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.ScrollView>

      {!isPast && (
        <View style={styles.ctaContainer}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {concert.ticket_url && (
              <TouchableOpacity
                style={[styles.ctaButton, { flex: 1 }]}
                onPress={openTickets}
                activeOpacity={0.85}
              >
                <Ionicons name="ticket-outline" size={20} color="#fff" />
                <Text
                  style={{
                    color: '#fff',
                    fontFamily: fontFamily.bodyBold,
                    fontSize: 15,
                    letterSpacing: 0.3,
                    marginLeft: spacing.sm,
                  }}
                >
                  {t('concertDetail.buyTickets')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.iconCtaButton}
              onPress={handleAddToCalendar}
              activeOpacity={0.85}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.silver} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconCtaButton}
              onPress={handleShare}
              activeOpacity={0.85}
            >
              <Ionicons name="share-social-outline" size={20} color={colors.silver} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ReportReasonModal
        visible={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        onSubmit={handleReportSubmit}
      />
    </KeyboardAvoidingView>
  );
}

/* ---------- Subcomponentes ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
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

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
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
    fontSize: 18,
    letterSpacing: 0.5,
  },
  heroContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: colors.ink,
    zIndex: 10,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
    flex: 1,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  metaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  dateBox: {
    width: 60,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaInfo: {
    flex: 1,
    minWidth: 0,
  },
  section: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
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
  gallerySection: {
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: spacing.lg,
  },
  ctaContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    backgroundColor: colors.ink,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.blood,
    borderWidth: 1,
    borderColor: colors.bloodBright,
    shadowColor: colors.blood,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  iconCtaButton: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
