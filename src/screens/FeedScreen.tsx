import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ActivityEvent, useActivityFeed } from '../hooks/useActivityFeed';
import { FeedStackParamList } from '../navigation/FeedStack';
import { colors, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';
import EmptyState from '../components/EmptyState';
import FeedSkeleton from '../components/skeletons/FeedSkeleton';
import { localeFromI18n } from '../i18n';

const EVENT_ICON: Record<ActivityEvent['type'], keyof typeof Ionicons.glyphMap> = {
  concert_going: 'checkmark-circle-outline',
  concert_attended: 'trophy-outline',
  concert_rated: 'star',
  festival_going: 'checkmark-circle-outline',
  festival_attended: 'trophy-outline',
  festival_rated: 'star',
  user_followed: 'person-add-outline',
};

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<FeedStackParamList>>();
  const { events, loading, reload } = useActivityFeed();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const handlePress = (event: ActivityEvent) => {
    if (event.concert) {
      navigation.navigate('ConcertDetail', { concertId: event.concert.id });
    } else if (event.festival) {
      navigation.navigate('FestivalDetail', { festivalId: event.festival.id });
    } else if (event.targetUser) {
      navigation.navigate('PublicProfile', { userId: event.targetUser.id });
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text variant="monoMD" color="muted">
          {t('feed.eyebrow')}
        </Text>
        <Text variant="displayLG" style={{ marginTop: 4 }}>
          {t('feed.title')}
        </Text>
      </View>

      {loading && events.length === 0 ? (
        <FeedSkeleton />
      ) : events.length === 0 ? (
        <EmptyState
          icon="pulse-outline"
          title={t('feed.emptyTitle')}
          description={t('feed.emptyDesc')}
          actionLabel={t('feed.emptyCta')}
          onAction={() => navigation.navigate('UserSearch')}
        />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.bloodBright} />
          }
          renderItem={({ item }) => <FeedItem event={item} onPress={() => handlePress(item)} />}
        />
      )}
    </View>
  );
}

function FeedItem({ event, onPress }: { event: ActivityEvent; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = localeFromI18n(i18n.language);

  const actorName = event.actor.username ? `@${event.actor.username}` : event.actor.display_name;
  const targetName = event.targetUser?.username
    ? `@${event.targetUser.username}`
    : event.targetUser?.display_name;

  let message = '';
  switch (event.type) {
    case 'concert_going':
      message = t('feed.eventConcertGoing', { actor: actorName, band: event.concert?.headlinerName });
      break;
    case 'concert_attended':
      message = t('feed.eventConcertAttended', {
        actor: actorName,
        band: event.concert?.headlinerName,
      });
      break;
    case 'concert_rated':
      message = t('feed.eventConcertRated', {
        actor: actorName,
        band: event.concert?.headlinerName,
        rating: event.rating,
      });
      break;
    case 'festival_going':
      message = t('feed.eventFestivalGoing', { actor: actorName, festival: event.festival?.name });
      break;
    case 'festival_attended':
      message = t('feed.eventFestivalAttended', { actor: actorName, festival: event.festival?.name });
      break;
    case 'festival_rated':
      message = t('feed.eventFestivalRated', {
        actor: actorName,
        festival: event.festival?.name,
        rating: event.rating,
      });
      break;
    case 'user_followed':
      message = t('feed.eventFollowed', { actor: actorName, target: targetName });
      break;
  }

  const dateLabel = new Date(event.created_at)
    .toLocaleDateString(locale, { day: '2-digit', month: 'short' })
    .toUpperCase()
    .replace(/\./g, '');

  const image = event.concert?.headlinerImage ?? event.festival?.image_url ?? null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {image ? (
        <BandImage url={image} size={40} radiusOverride={radius.sm} showTag={false} />
      ) : (
        <View style={styles.iconCircle}>
          <Ionicons name={EVENT_ICON[event.type]} size={18} color={colors.bloodBright} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
        <Text variant="body" numberOfLines={2}>
          {message}
        </Text>
        <Text variant="monoSM" color="muted" style={{ marginTop: 4 }}>
          {dateLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: spacing.xl },
  header: { marginBottom: spacing.lg },
  listContent: { paddingBottom: spacing.xxxl, gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
