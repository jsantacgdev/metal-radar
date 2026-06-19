import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useBandInfo, BandMember } from '../hooks/useBandInfo';
import { useFollowedBands } from '../hooks/useFollowedBands';
import { followBand, syncBandConcerts } from '../lib/bands';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text, Tag } from '../components/ui';
import BandImage from '../components/BandImage';
import BandDetailSkeleton from '../components/skeletons/BandDetailSkeleton';
import { RadarStackParamList } from '../navigation/RadarStack';
import { useLayoutEffect } from 'react';
import { useNavigation } from '@react-navigation/native';

type Props = NativeStackScreenProps<RadarStackParamList, 'BandDetail'>;

const HERO_MAX_HEIGHT = 220;
const HERO_MIN_HEIGHT = 60;
const HERO_SCROLL_DISTANCE = HERO_MAX_HEIGHT - HERO_MIN_HEIGHT;

async function fetchBandBasics(bandId: string) {
  const { data, error } = await supabase
    .from('bands')
    .select('id, name, image_url, genres, spotify_id')
    .eq('id', bandId)
    .single();
  if (error) throw error;
  return data;
}

export default function BandDetailScreen({ route }: Props) {
  const { t } = useTranslation();
  const { bandId } = route.params;
  const insets = useSafeAreaInsets();

  const { data: basics } = useQuery({
    queryKey: ['bandBasics', bandId],
    queryFn: () => fetchBandBasics(bandId),
  });

  const { info, loading, error } = useBandInfo(bandId);

  const queryClient = useQueryClient();
  const { bands: followedBands, unfollow } = useFollowedBands();
  const [following, setFollowing] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;

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

  const titleOpacity = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation();

  const isFollowed = useMemo(
    () => followedBands.some((b) => b.id === bandId),
    [followedBands, bandId],
  );

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

  function getFlagEmoji(countryCode: string) {
    if (!countryCode || countryCode.length !== 2) return countryCode;
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  const handleToggleFollow = async () => {
    if (following) return;
    if (isFollowed) {
      unfollow(bandId);
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      return;
    }

    const source = info ?? basics;
    if (!source) return;

    try {
      setFollowing(true);
      const newBandId = await followBand({
        spotify_id: (source as any).spotify_id ?? null,
        name: source.name,
        image_url: source.image_url ?? null,
        genres: source.genres ?? [],
      });
      queryClient.invalidateQueries({ queryKey: ['followedBands'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      syncBandConcerts(newBandId).then((result) => {
        if (result && result.synced > 0) {
          queryClient.invalidateQueries({ queryKey: ['nearbyConcerts'] });
        }
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setFollowing(false);
    }
  };

  const bandName = info?.name ?? basics?.name ?? '...';
  const bandImage = info?.image_url ?? basics?.image_url ?? null;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Animated.Text
          style={{
            opacity: titleOpacity,
            color: colors.bright,
            fontFamily: fontFamily.displayBold,
            fontSize: 20,
            // letterSpacing: 0.5,
          }}
          numberOfLines={1}
        >
          {bandName}
        </Animated.Text>
      ),
    });
  }, [navigation, bandName, titleOpacity]);

  return (
    <View style={styles.container}>
      {/* HERO COLAPSABLE FIJO ARRIBA */}
      <Animated.View
        style={[
          styles.heroContainer,
          {
            height: heroHeight,
          },
        ]}
      >
        {/* Fondo que aparece al colapsar */}
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

        {/* Contenido del hero expandido */}
        <Animated.View
          style={[styles.heroContent, { opacity: heroContentOpacity }]}
          pointerEvents="none"
        >
          <Animated.View
            style={{
              transform: [{ scale: imageScale }, { translateY: imageTranslateY }],
            }}
          >
            <BandImage url={bandImage} size={130} radiusOverride={radius.lg} showTag={!bandImage} />
          </Animated.View>
          <View style={styles.heroText}>
            <Text variant="monoMD" color="bloodBright">
              {t('bandDetail.heroLabel')}
            </Text>
            <Text
              variant="displayMD"
              style={{ marginTop: spacing.sm }}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {bandName}
            </Text>
            {info?.country && (
              <View style={styles.countryRow}>
                <Text style={styles.flagEmoji}>{getFlagEmoji(info.country)}</Text>
              </View>
            )}
          </View>
        </Animated.View>
      </Animated.View>

      {/* SCROLLABLE CONTENT */}
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: HERO_MAX_HEIGHT,
          paddingBottom: spacing.xxxl,
        }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
      >
        {/* Botón Seguir */}
        {(info || basics) && (
          <View style={styles.followButtonWrapper}>
            <TouchableOpacity
              style={[
                styles.followButton,
                isFollowed && styles.followButtonActive,
                following && { opacity: 0.6 },
              ]}
              onPress={handleToggleFollow}
              disabled={following}
              activeOpacity={0.8}
            >
              {following ? (
                <ActivityIndicator color={isFollowed ? colors.bloodBright : '#fff'} size="small" />
              ) : (
                <>
                  <Ionicons
                    name={isFollowed ? 'heart' : 'heart-outline'}
                    size={18}
                    color={isFollowed ? colors.bloodBright : '#fff'}
                  />
                  <Text
                    style={{
                      fontFamily: fontFamily.displayBold,
                      fontSize: 14,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color: isFollowed ? colors.bloodBright : '#fff',
                      marginLeft: spacing.sm,
                    }}
                  >
                    {isFollowed ? t('bandDetail.followingButton') : t('bandDetail.followButton')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {loading && !info && <BandDetailSkeleton />}

        {error && (
          <View style={styles.errorBox}>
            <Text variant="bodySM" color="bloodBright">
              {error}
            </Text>
          </View>
        )}

        {info && (
          <>
            <View style={styles.metaStrip}>
              {info.formed_year && (
                <MetaItem
                  label={t('bandDetail.metaSince')}
                  value={info.formed_year.toString()}
                  accent
                  center
                />
              )}
              {info.members && info.members.length > 0 && (
                <MetaItem
                  label={t('bandDetail.metaMembers')}
                  value={info.members.filter((m) => m.current).length.toString()}
                  center
                />
              )}
              {info.genres && info.genres.length > 0 && (
                <MetaItem
                  label={t('bandDetail.metaGenre')}
                  value={info.genres.length > 1 ? info.genres[1] : info.genres[0]}
                  smallValue
                  center
                />
              )}
            </View>

            {info.bio && (
              <Section title={t('bandDetail.bioTitle')}>
                <Text variant="body" color="silver" style={{ lineHeight: 22 }}>
                  {info.bio.length > 1000 ? info.bio.slice(0, 1000) + '…' : info.bio}
                </Text>
              </Section>
            )}

            {info.genres && info.genres.length > 1 && (
              <Section title={t('bandDetail.styleTitle')}>
                <View style={styles.tagsRow}>
                  {info.genres.map((g, i) => (
                    <Tag key={i} tone={i === 0 ? 'blood' : 'steel'}>
                      {g}
                    </Tag>
                  ))}
                </View>
              </Section>
            )}

            {info.members && info.members.length > 0 && (
              <Section title={t('bandDetail.lineupTitle')}>
                {info.members.map((m: BandMember, i: number) => (
                  <View key={i} style={styles.memberRow}>
                    <View style={styles.memberDot}>
                      <View
                        style={[
                          styles.memberDotInner,
                          m.current && { backgroundColor: colors.bloodBright },
                        ]}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="displaySM">{m.name}</Text>
                      {(m.begin || m.end || m.current) && (
                        <Text variant="monoSM" color="muted" style={{ marginTop: 4 }}>
                          {m.begin ? m.begin.substring(0, 4) : '?'} —{' '}
                          {m.current
                            ? t('bandDetail.present')
                            : m.end
                              ? m.end.substring(0, 4)
                              : '?'}
                        </Text>
                      )}
                    </View>
                    {m.current && (
                      <Text variant="monoSM" color="bloodBright">
                        {t('bandDetail.current')}
                      </Text>
                    )}
                  </View>
                ))}
              </Section>
            )}
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
}

function MetaItem({
  label,
  value,
  accent,
  center,
  smallValue,
}: {
  label: string;
  value: string;
  accent?: boolean;
  center?: boolean;
  smallValue?: boolean;
}) {
  return (
    <View style={[styles.metaItem, center && { alignItems: 'center' }]}>
      <Text
        style={{
          fontFamily: fontFamily.displayBold,
          fontSize: smallValue ? 12 : 22,
          letterSpacing: -0.4,
          color: accent ? colors.bloodBright : colors.bright,
          textTransform: smallValue ? 'capitalize' : 'uppercase',
          textAlign: center ? 'center' : 'left',
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text variant="monoSM" color="muted" style={{ marginTop: 4 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  heroContainer: {
    position: 'absolute',
    top: 0,
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
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  flagEmoji: {
    fontSize: 32,
    lineHeight: 36,
  },
  followButtonWrapper: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.blood,
    borderWidth: 1,
    borderColor: colors.bloodBright,
  },
  followButtonActive: {
    backgroundColor: 'transparent',
    borderColor: colors.bloodBright,
  },
  errorBox: {
    margin: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
  },
  metaStrip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: spacing.lg,
  },
  metaItem: {
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
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  memberDot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  memberDotInner: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.faint,
  },
});
