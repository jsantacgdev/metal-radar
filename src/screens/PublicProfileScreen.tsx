import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { usePublicProfile, useFollowCounts } from '../hooks/usePublicProfile';
import { useFollowUser } from '../hooks/useUserFollows';
import { DiaryEntry, useUserDiary } from '../hooks/useDiary';
import { ProfileStackParamList } from '../navigation/ProfileStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Button, Text } from '../components/ui';
import BandImage from '../components/BandImage';
import EmptyState from '../components/EmptyState';
import { localeFromI18n } from '../i18n';

type Route = RouteProp<ProfileStackParamList, 'PublicProfile'>;

export default function PublicProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = localeFromI18n(i18n.language);
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { params } = useRoute<Route>();
  const { userId } = params;

  const { data, loading, error } = usePublicProfile(userId);
  const { counts } = useFollowCounts(userId);
  const { follow, unfollow, loading: followBusy } = useFollowUser(userId);
  const [confirmingUnfollow, setConfirmingUnfollow] = useState(false);

  const canSeeDiary = data?.followState === 'self' || data?.followState === 'accepted';
  const { entries: diaryEntries, loading: diaryLoading } = useUserDiary(canSeeDiary ? userId : null);

  const handleFollow = async () => {
    try {
      await follow();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleUnfollow = () => {
    const isPending = data?.followState === 'pending';
    setConfirmingUnfollow(true);
    Alert.alert(
      isPending ? t('social.cancelRequestTitle') : t('social.unfollowTitle'),
      isPending ? t('social.cancelRequestBody') : t('social.unfollowBody'),
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => setConfirmingUnfollow(false) },
        {
          text: isPending ? t('social.cancelRequest') : t('social.unfollow'),
          style: 'destructive',
          onPress: async () => {
            try {
              await unfollow();
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message);
            } finally {
              setConfirmingUnfollow(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('social.profileTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : error || !data ? (
        <View style={styles.centered}>
          <Text variant="bodySM" color="bloodBright" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
            {error ?? t('common.error')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
          <View style={styles.userBlock}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={colors.silver} />
            </View>
            <Text variant="displayLG" style={{ marginTop: spacing.md }}>
              @{data.profile.username}
            </Text>
            {data.profile.display_name && (
              <Text variant="body" color="muted" style={{ marginTop: 4 }}>
                {data.profile.display_name}
              </Text>
            )}
            {data.profile.is_private && data.followState !== 'accepted' && data.followState !== 'self' && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={12} color={colors.muted} />
                <Text variant="monoSM" color="muted" style={{ marginLeft: 4 }}>
                  {t('social.private')}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.countsRow}>
            <TouchableOpacity
              style={styles.countBtn}
              onPress={() => navigation.navigate('FollowList', { userId, mode: 'followers' })}
              activeOpacity={0.7}
            >
              <Text variant="displaySM">{counts.followers}</Text>
              <Text variant="monoSM" color="muted" style={{ marginTop: 2 }}>
                {t('social.followers')}
              </Text>
            </TouchableOpacity>
            <View style={styles.countDivider} />
            <TouchableOpacity
              style={styles.countBtn}
              onPress={() => navigation.navigate('FollowList', { userId, mode: 'following' })}
              activeOpacity={0.7}
            >
              <Text variant="displaySM">{counts.following}</Text>
              <Text variant="monoSM" color="muted" style={{ marginTop: 2 }}>
                {t('social.following')}
              </Text>
            </TouchableOpacity>
          </View>

          {data.followState !== 'self' && (
            <View style={styles.actionSection}>
              {data.followState === 'none' && (
                <Button
                  label={t('social.follow')}
                  onPress={handleFollow}
                  loading={followBusy}
                  icon={<Ionicons name="person-add" size={18} color="#fff" />}
                />
              )}
              {data.followState === 'pending' && (
                <Button
                  label={t('social.requested')}
                  variant="secondary"
                  onPress={handleUnfollow}
                  loading={followBusy || confirmingUnfollow}
                  icon={<Ionicons name="time-outline" size={18} color={colors.bright} />}
                />
              )}
              {data.followState === 'accepted' && (
                <Button
                  label={t('social.unfollow')}
                  variant="ghost"
                  onPress={handleUnfollow}
                  loading={followBusy || confirmingUnfollow}
                  icon={<Ionicons name="checkmark" size={18} color={colors.silver} />}
                />
              )}
            </View>
          )}

          <View style={styles.diarySection}>
            <Text variant="monoMD" color="muted" style={{ marginBottom: spacing.md }}>
              {t('social.diaryTitle')}
            </Text>
            {!canSeeDiary ? (
              <EmptyState
                icon="lock-closed-outline"
                title={t('social.privateProfileTitle')}
                description={t('social.followToSeeDiary')}
              />
            ) : diaryLoading ? (
              <ActivityIndicator color={colors.bloodBright} style={{ marginTop: spacing.lg }} />
            ) : diaryEntries.length === 0 ? (
              <EmptyState
                icon="book-outline"
                title={t('social.emptyDiaryTitle')}
                description={t('social.emptyDiaryDesc')}
              />
            ) : (
              diaryEntries.map((entry) => (
                <PublicDiaryItem
                  key={entry.id}
                  entry={entry}
                  locale={locale}
                  onPress={() =>
                    entry.kind === 'festival'
                      ? navigation.navigate('FestivalDetail', { festivalId: entry.concert_id })
                      : navigation.navigate('ConcertDetail', { concertId: entry.concert_id })
                  }
                />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function PublicDiaryItem({
  entry,
  locale,
  onPress,
}: {
  entry: DiaryEntry;
  locale: string;
  onPress: () => void;
}) {
  const firstBand = entry.concert.bands[0];
  const dateLabel = new Date(entry.concert.event_date)
    .toLocaleDateString(locale, { day: '2-digit', month: 'short', year: '2-digit' })
    .toUpperCase()
    .replace(/\./g, '');

  return (
    <TouchableOpacity style={styles.diaryCard} onPress={onPress} activeOpacity={0.85}>
      <BandImage
        url={entry.kind === 'festival' ? (entry.concert.image_url ?? null) : (firstBand?.image_url ?? null)}
        size={44}
        radiusOverride={radius.sm}
        showTag={entry.kind === 'festival' ? !entry.concert.image_url : !firstBand?.image_url}
      />
      <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="displaySM" numberOfLines={1} style={{ flex: 1 }}>
            {entry.kind === 'festival' && entry.concert.festival_name
              ? entry.concert.festival_name
              : firstBand?.name}
          </Text>
          <Text variant="monoSM" color="muted" style={{ marginLeft: spacing.sm }}>
            {dateLabel}
          </Text>
        </View>
        <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
          {entry.concert.venue.name}
          {entry.concert.venue.city ? ` · ${entry.concert.venue.city}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.bright,
    fontFamily: fontFamily.displayBold,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userBlock: { alignItems: 'center', padding: spacing.xl },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  countsRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  countBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  countDivider: { width: 1, backgroundColor: colors.line },
  actionSection: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  blockLink: { alignItems: 'center', marginTop: spacing.md },
  diarySection: { paddingHorizontal: spacing.xl, marginTop: spacing.xxxl },
  diaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
});
