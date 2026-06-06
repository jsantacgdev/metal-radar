import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  useNavigation,
  useFocusEffect,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import {
  DiaryEntry,
  useDiary,
} from '../hooks/useDiary';
import { DiaryStackParamList } from '../navigation/DiaryStack';

type FilterMode = 'upcoming' | 'past';

export default function DiaryScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<DiaryStackParamList>
    >();
  const { entries, loading, error, reload } =
    useDiary();
  const [filter, setFilter] =
    useState<FilterMode>('upcoming');

  const filtered = useMemo(() => {
    if (filter === 'upcoming') {
      return entries.filter(
        (e) =>
          e.status !== 'attended' &&
          new Date(
            e.concert.event_date,
          ).getTime() >= Date.now(),
      );
    }
    return entries.filter(
      (e) =>
        e.status === 'attended' ||
        new Date(e.concert.event_date).getTime() <
          Date.now(),
    );
  }, [entries, filter]);

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <FilterTab
          label="Próximos"
          active={filter === 'upcoming'}
          onPress={() => setFilter('upcoming')}
        />
        <FilterTab
          label="Pasados"
          active={filter === 'past'}
          onPress={() => setFilter('past')}
        />
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error}
          </Text>
        </View>
      )}

      {loading && entries.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator
            color="#dc2626"
            size="large"
          />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {filter === 'upcoming'
              ? 'Sin próximos conciertos'
              : 'Sin conciertos pasados'}
          </Text>
          <Text style={styles.emptySub}>
            {filter === 'upcoming'
              ? 'Marca conciertos como "Voy" desde el mapa'
              : 'Aquí aparecerán los conciertos a los que asistas'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={reload}
              tintColor="#dc2626"
            />
          }
          renderItem={({ item }) => (
            <DiaryItem
              entry={item}
              onPress={() =>
                navigation.navigate(
                  'ConcertDetail',
                  { concertId: item.concert_id },
                )
              }
            />
          )}
        />
      )}
    </View>
  );
}

function FilterTab({
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
      style={[
        styles.tab,
        active && styles.tabActive,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.tabText,
          active && styles.tabTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DiaryItem({
  entry,
  onPress,
}: {
  entry: DiaryEntry;
  onPress: () => void;
}) {
  const date = new Date(entry.concert.event_date);
  const dateStr = date.toLocaleDateString(
    'es-ES',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
  );

  const statusLabel: Record<
    DiaryEntry['status'],
    string
  > = {
    interested: 'Me interesa',
    going: 'Voy',
    attended: 'Asistí',
  };

  const statusColor: Record<
    DiaryEntry['status'],
    string
  > = {
    interested: '#666',
    going: '#dc2626',
    attended: '#1f7a3a',
  };

  const firstBand = entry.concert.bands[0];

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
    >
      {firstBand?.image_url ? (
        <Image
          source={{ uri: firstBand.image_url }}
          style={styles.cardImage}
        />
      ) : (
        <View
          style={[
            styles.cardImage,
            { backgroundColor: '#222' },
          ]}
        />
      )}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          style={styles.cardTitle}
          numberOfLines={1}
        >
          {entry.concert.bands
            .map((b) => b.name)
            .join(' · ')}
        </Text>
        <Text
          style={styles.cardSub}
          numberOfLines={1}
        >
          {entry.concert.venue.name} ·{' '}
          {entry.concert.venue.city}
        </Text>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardDate}>
            {dateStr}
          </Text>
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  statusColor[entry.status],
              },
            ]}
          >
            <Text style={styles.badgeText}>
              {statusLabel[entry.status]}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySub: {
    color: '#777',
    textAlign: 'center',
  },
  errorBox: {
    padding: 16,
    backgroundColor: '#7a1f1f',
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    color: '#fff',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  tab: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#dc2626',
  },
  tabText: {
    color: '#777',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  cardImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cardSub: {
    color: '#999',
    fontSize: 13,
    marginTop: 2,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  cardDate: {
    color: '#bbb',
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
