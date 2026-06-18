import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import PulsingBadge from '../components/PulsingBadge';
import BandImage from '../components/BandImage';
import { useFollowedBands, FollowedBand } from '../hooks/useFollowedBands';
import { useRecommendations, RecommendedBand } from '../hooks/useRecommendations';
import { followBand, getOrCreateBandId, syncBandConcerts } from '../lib/bands';
import { usePreference } from '../hooks/usePreference';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import { supabase } from '../lib/supabase';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RadarStackParamList } from '../navigation/RadarStack';
import { localeFromI18n } from '../i18n';
import EmptyState from '../components/EmptyState';

type Tab = 'foryou' | 'mybands';

export default function RadarScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RadarStackParamList>>();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();

  const locale = localeFromI18n(i18n.language);

  const {
    bands: followedBands,
    loading: loadingFollowed,
    reload: reloadFollowed,
    unfollow,
  } = useFollowedBands();

  const {
    recommendations,
    loading: loadingRecs,
    refreshing: refreshingRecs,
    reload: reloadRecs,
  } = useRecommendations();

  const [activeTab, setActiveTab] = useState<Tab>('foryou');
  const [followingId, setFollowingId] = useState<string | null>(null);
  const [newBandIds, setNewBandIds] = useState<Set<string>>(new Set());
  const previousIdsRef = useRef<Set<string> | null>(null);
  const followedPositionRef = useRef<number | null>(null);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [insertSlot, setInsertSlot] = useState<{
    position: number;
    bandIds: string[];
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const { value: skipConfirm, setValue: setSkipConfirm } = usePreference<boolean>(
    'skipUnfollowConfirm',
    false,
  );

  const scheduleRecommendationsRefresh = useCallback(() => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }
    refreshDebounceRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      refreshDebounceRef.current = null;
    }, 3000);
  }, [queryClient]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const openBandDetail = async (band: {
    spotify_id?: string;
    id?: string;
    name: string;
    image_url: string | null;
    genres: string[];
  }) => {
    try {
      let bandId: string;
      if (band.id) {
        bandId = band.id;
      } else if (band.spotify_id) {
        bandId = await getOrCreateBandId({
          spotify_id: band.spotify_id,
          name: band.name,
          image_url: band.image_url,
          genres: band.genres,
        });
      } else {
        return;
      }
      navigation.navigate('BandDetail', { bandId });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  useFocusEffect(
    useCallback(() => {
      reloadFollowed();
    }, [reloadFollowed]),
  );

  const followedNames = useMemo(
    () => new Set(followedBands.map((b: FollowedBand) => b.name.toLowerCase())),
    [followedBands],
  );

  const visibleRecs = useMemo(() => {
    const filtered = recommendations.filter((r) => !followedNames.has(r.name.toLowerCase()));
    if (!insertSlot || insertSlot.bandIds.length === 0) return filtered;
    const insertSet = new Set(insertSlot.bandIds);
    const newOnes: RecommendedBand[] = [];
    const others: RecommendedBand[] = [];
    for (const rec of filtered) {
      if (insertSet.has(rec.spotify_id)) newOnes.push(rec);
      else others.push(rec);
    }
    const result = [...others];
    const insertAt = Math.min(insertSlot.position, result.length);
    result.splice(insertAt, 0, ...newOnes);
    return result;
  }, [recommendations, followedNames, insertSlot]);

  useEffect(() => {
    if (recommendations.length === 0) return;
    const currentIds = new Set(recommendations.map((r) => r.spotify_id));

    if (previousIdsRef.current === null) {
      previousIdsRef.current = currentIds;
      return;
    }

    const fresh = new Set<string>();
    for (const id of currentIds) {
      if (!previousIdsRef.current.has(id)) fresh.add(id);
    }
    previousIdsRef.current = currentIds;

    if (fresh.size > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setNewBandIds((prev) => new Set([...prev, ...fresh]));

      if (followedPositionRef.current !== null) {
        setInsertSlot({
          position: followedPositionRef.current,
          bandIds: Array.from(fresh),
        });
        followedPositionRef.current = null;
      }

      setTimeout(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setNewBandIds((prev) => {
          const next = new Set(prev);
          for (const id of fresh) next.delete(id);
          return next;
        });
        setInsertSlot(null);
      }, 8000);
    }
  }, [recommendations]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/search-bands?q=${encodeURIComponent(searchQuery.trim())}`,
          {
            headers: {
              Authorization: `Bearer ${session?.access_token ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            },
          },
        );
        const json = await res.json();
        setSearchResults(json.bands ?? []);
      } catch (err: any) {
        Alert.alert(t('common.error'), err.message);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, t]);

  useEffect(() => {
    return () => {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }
    };
  }, []);

  const handleFollowRec = async (band: RecommendedBand) => {
    if (followingId) return;
    try {
      setFollowingId(band.spotify_id);
      const position = visibleRecs.findIndex((r) => r.spotify_id === band.spotify_id);
      followedPositionRef.current = position;
      const bandId = await followBand(band);
      queryClient.invalidateQueries({ queryKey: ['followedBands'] });
      scheduleRecommendationsRefresh();
      syncBandConcerts(bandId).then((result) => {
        if (result && result.synced > 0) {
          queryClient.invalidateQueries({ queryKey: ['nearbyConcerts'] });
        }
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setFollowingId(null);
    }
  };

  const handleFollowFromSearch = async (band: any) => {
    try {
      setFollowingId(band.spotify_id);
      const bandId = await followBand(band);
      setSearchQuery('');
      setSearchResults([]);
      queryClient.invalidateQueries({ queryKey: ['followedBands'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      syncBandConcerts(bandId).then((result) => {
        if (result && result.synced > 0) {
          queryClient.invalidateQueries({ queryKey: ['nearbyConcerts'] });
        }
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setFollowingId(null);
    }
  };

  const handleUnfollow = (bandId: string, bandName: string) => {
    if (skipConfirm) {
      unfollow(bandId);
      return;
    }
    Alert.alert(t('radar.unfollowTitle'), t('radar.unfollowBody', { name: bandName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('radar.unfollowDontAsk'),
        style: 'destructive',
        onPress: () => {
          setSkipConfirm(true);
          unfollow(bandId);
        },
      },
      { text: t('radar.unfollowConfirm'), style: 'destructive', onPress: () => unfollow(bandId) },
    ]);
  };

  const dateStr = new Date()
    .toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
    .replace('.', '')
    .toUpperCase();

  const newForYou = visibleRecs.slice(0, 5);
  const emerging = visibleRecs.slice(5);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <View>
          <Text variant="monoMD" color="muted">
            {dateStr}
          </Text>
          <Text variant="displayLG" style={{ marginTop: 4 }}>
            {t('radar.title')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.avatarBtn}
          onPress={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          activeOpacity={0.7}
        >
          <Ionicons
            name={searchOpen ? 'close' : 'search'}
            size={20}
            color={searchOpen ? colors.bloodBright : colors.silver}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsRow}>
        <TabPill
          label={t('radar.tabForYou')}
          active={activeTab === 'foryou'}
          onPress={() => setActiveTab('foryou')}
        />
        <TabPill
          label={t('radar.tabMyBands')}
          active={activeTab === 'mybands'}
          onPress={() => setActiveTab('mybands')}
        />
      </View>

      {searchOpen && (
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('radar.searchPlaceholder')}
            placeholderTextColor={colors.faint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="words"
            autoFocus
          />
          {searching && (
            <ActivityIndicator color={colors.bloodBright} style={{ marginLeft: spacing.sm }} />
          )}
        </View>
      )}

      {searchOpen && searchResults.length > 0 && (
        <View style={styles.listSection}>
          {searchResults.map((b: any, i) => {
            const isFollowed = followedNames.has(b.name.toLowerCase());
            return (
              <TouchableOpacity
                key={b.spotify_id}
                style={[styles.row, i === searchResults.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() =>
                  openBandDetail({
                    spotify_id: b.spotify_id,
                    name: b.name,
                    image_url: b.image_url,
                    genres: b.genres ?? [],
                  })
                }
                activeOpacity={0.7}
              >
                <BandImage url={b.image_url} size={50} showTag={!b.image_url} />
                <View style={styles.rowContent}>
                  <Text variant="displaySM" numberOfLines={1} style={{ paddingVertical: 2 }}>
                    {b.name}
                  </Text>
                  {b.genres?.length > 0 && (
                    <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 4 }}>
                      {b.genres.slice(0, 2).join(' · ')}
                    </Text>
                  )}
                </View>
                {isFollowed ? (
                  <Text variant="monoSM" color="muted" style={{ marginRight: 4 }}>
                    {t('radar.followingBadge')}
                  </Text>
                ) : (
                  <TouchableOpacity
                    style={[styles.addBtn, followingId === b.spotify_id && { opacity: 0.5 }]}
                    onPress={() => {
                      handleFollowFromSearch(b);
                      closeSearch();
                    }}
                    disabled={followingId !== null}
                  >
                    {followingId === b.spotify_id ? (
                      <ActivityIndicator color={colors.silver} size="small" />
                    ) : (
                      <Ionicons name="add" size={18} color={colors.silver} />
                    )}
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {activeTab === 'foryou' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshingRecs}
              onRefresh={reloadRecs}
              tintColor={colors.bloodBright}
            />
          }
        >
          {newForYou.length > 0 && (
            <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
              {t('radar.newForYouTitle')}
            </Text>
          )}
          {loadingRecs && newForYou.length === 0 ? (
            <ActivityIndicator color={colors.bloodBright} style={{ marginVertical: spacing.xl }} />
          ) : newForYou.length === 0 ? (
            <EmptyState
              icon="radio-outline"
              title={t('radar.emptyForYouTitle')}
              description={t('radar.emptyForYouDesc')}
              actionLabel={t('radar.emptyForYouCta')}
              onAction={() => setSearchOpen(true)}
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContent}
            >
              {newForYou.map((rec) => {
                const isNew = newBandIds.has(rec.spotify_id);
                const isFollowing = followingId === rec.spotify_id;
                return (
                  <TouchableOpacity
                    key={rec.spotify_id}
                    style={styles.carouselCard}
                    onPress={() =>
                      openBandDetail({
                        spotify_id: rec.spotify_id,
                        name: rec.name,
                        image_url: rec.image_url,
                        genres: rec.genres,
                      })
                    }
                    activeOpacity={0.85}
                  >
                    <View style={styles.carouselImageWrapper}>
                      <BandImage
                        url={rec.image_url}
                        size={138}
                        radiusOverride={radius.lg}
                        showTag={!rec.image_url}
                      />

                      {isNew && (
                        <View style={styles.topLeftBadge}>
                          <PulsingBadge label={t('radar.newBadge')} />
                        </View>
                      )}

                      <TouchableOpacity
                        style={styles.carouselAddBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleFollowRec(rec);
                        }}
                        disabled={followingId !== null}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                      >
                        {isFollowing ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Ionicons name="add" size={18} color="#fff" />
                        )}
                      </TouchableOpacity>
                    </View>

                    <View style={{ marginTop: spacing.sm, width: 138 }}>
                      <View style={styles.cardNameRow}>
                        <Text
                          variant="displaySM"
                          numberOfLines={1}
                          style={{ flexShrink: 1, paddingVertical: 2 }}
                        >
                          {rec.name}
                        </Text>
                      </View>

                      {rec.genres.length > 0 && (
                        <Text
                          variant="monoSM"
                          color="bloodBright"
                          numberOfLines={1}
                          style={{ marginTop: 6 }}
                        >
                          {rec.genres[0]}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {emerging.length > 0 && (
            <>
              <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
                {t('radar.emergingTitle')}
              </Text>
              <View style={styles.listSection}>
                {emerging.map((rec, i) => {
                  const isNew = newBandIds.has(rec.spotify_id);
                  return (
                    <TouchableOpacity
                      key={rec.spotify_id}
                      style={[styles.row, i === emerging.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() =>
                        openBandDetail({
                          spotify_id: rec.spotify_id,
                          name: rec.name,
                          image_url: rec.image_url,
                          genres: rec.genres,
                        })
                      }
                      activeOpacity={0.7}
                    >
                      <BandImage url={rec.image_url} size={50} showTag={!rec.image_url} />
                      <View style={styles.rowContent}>
                        <View style={styles.nameRow}>
                          <Text
                            variant="displaySM"
                            numberOfLines={1}
                            style={{ flexShrink: 1, paddingVertical: 2 }}
                          >
                            {rec.name}
                          </Text>
                          {isNew && <PulsingBadge label={t('radar.newBadge')} />}
                        </View>
                        {rec.genres.length > 0 && (
                          <Text
                            variant="monoSM"
                            color="muted"
                            numberOfLines={1}
                            style={{ marginTop: 4 }}
                          >
                            {rec.genres.slice(0, 2).join(' · ')}
                          </Text>
                        )}
                      </View>
                      <View style={styles.rowEnd}>
                        <Text
                          style={{
                            fontFamily: fontFamily.mono,
                            fontSize: 12,
                            color: colors.bloodBright,
                          }}
                        >
                          {rec.affinity}%
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.addBtn,
                            followingId === rec.spotify_id && { opacity: 0.5 },
                          ]}
                          onPress={() => handleFollowRec(rec)}
                          disabled={followingId !== null}
                          activeOpacity={0.7}
                        >
                          {followingId === rec.spotify_id ? (
                            <ActivityIndicator color={colors.silver} size="small" />
                          ) : (
                            <Ionicons name="add" size={18} color={colors.silver} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={loadingFollowed}
              onRefresh={reloadFollowed}
              tintColor={colors.bloodBright}
            />
          }
        >
          {followedBands.length > 0 && (
            <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
              {t('radar.followingTitle', { count: followedBands.length })}
            </Text>
          )}
          {loadingFollowed ? (
            <ActivityIndicator color={colors.bloodBright} style={{ marginTop: spacing.lg }} />
          ) : followedBands.length === 0 ? (
            <EmptyState
              icon="heart-outline"
              title={t('radar.emptyMyBandsTitle')}
              description={t('radar.emptyMyBandsDesc')}
              actionLabel={t('radar.emptyMyBandsCta')}
              onAction={() => setSearchOpen(true)}
            />
          ) : (
            <View style={styles.listSection}>
              {followedBands.map((b: FollowedBand, i) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.row, i === followedBands.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => {
                    openBandDetail({
                      id: b.id,
                      name: b.name,
                      image_url: b.image_url,
                      genres: b.genres ?? [],
                    });
                    closeSearch();
                  }}
                  activeOpacity={0.7}
                >
                  <BandImage url={b.image_url} size={50} showTag={!b.image_url} />
                  <View style={styles.rowContent}>
                    <Text variant="displaySM" numberOfLines={1} style={{ paddingVertical: 2 }}>
                      {b.name}
                    </Text>
                    {b.genres && b.genres.length > 0 && (
                      <Text
                        variant="monoSM"
                        color="muted"
                        numberOfLines={1}
                        style={{ marginTop: 4 }}
                      >
                        {b.genres.slice(0, 2).join(' · ')}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleUnfollow(b.id, b.name)}
                    style={styles.removeBtn}
                    hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  >
                    <Ionicons name="close" size={18} color={colors.muted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      )}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
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
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontStyle: 'italic',
    marginVertical: spacing.lg,
  },
  carouselContent: {
    gap: spacing.md,
    paddingRight: spacing.md,
  },
  carouselCard: {
    width: 138,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listSection: {
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  rowContent: {
    flex: 1,
    marginLeft: spacing.md,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    fontSize: 15,
    color: colors.bright,
    fontFamily: fontFamily.body,
  },
  carouselImageWrapper: {
    position: 'relative',
  },
  topLeftBadge: {
    position: 'absolute',
    top: 10,
    right: 5,
    zIndex: 10,
  },
  carouselAddBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.blood,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.blood,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
});
