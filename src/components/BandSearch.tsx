import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from './ui';

export type SearchedBand = {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
};

type Props = {
  onFollow: (band: SearchedBand) => Promise<void>;
  followedSpotifyIds: Set<string>;
  placeholder?: string;
};

export default function BandSearch({ onFollow, followedSpotifyIds, placeholder }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedBand[]>([]);
  const [searching, setSearching] = useState(false);
  const [followingId, setFollowingId] = useState<string | null>(null);

  const resolvedPlaceholder = placeholder ?? t('bandSearch.defaultPlaceholder');

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => doSearch(query.trim()), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce solo por query: doSearch se recrea en cada render y reiniciaría el temporizador (búsqueda en bucle)
  }, [query]);

  const doSearch = async (q: string) => {
    try {
      setSearching(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/search-bands?q=${encodeURIComponent(q)}`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
          },
        },
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResults(json.bands ?? []);
    } catch (err: any) {
      Alert.alert(t('bandSearch.searchErrorTitle'), err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleFollow = async (band: SearchedBand) => {
    try {
      setFollowingId(band.spotify_id);
      await onFollow(band);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setFollowingId(null);
    }
  };

  return (
    <View>
      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder={resolvedPlaceholder}
          placeholderTextColor={colors.faint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
        />
        {searching && <ActivityIndicator color={colors.bloodBright} style={styles.searchSpinner} />}
      </View>

      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item, index) => item.spotify_id ?? `name-${item.name}-${index}`}
          scrollEnabled={false}
          keyboardShouldPersistTaps="handled"
          style={{ marginTop: spacing.md }}
          renderItem={({ item }) => {
            const isFollowed = followedSpotifyIds.has(item.spotify_id);
            const isLoading = followingId === item.spotify_id;
            return (
              <View style={styles.row}>
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={styles.image} />
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder]} />
                )}
                <View style={styles.rowContent}>
                  <Text variant="displaySM" numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.genres.length > 0 && (
                    <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 4 }}>
                      {item.genres.slice(0, 2).join(' · ')}
                    </Text>
                  )}
                </View>
                {isFollowed ? (
                  <View style={styles.followedBadge}>
                    <Ionicons name="checkmark" size={14} color={colors.muted} />
                    <Text variant="monoSM" color="muted">
                      {t('bandSearch.followingBadge')}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.followBtn}
                    onPress={() => handleFollow(item)}
                    disabled={isLoading}
                    activeOpacity={0.7}
                    accessibilityLabel={t('social.follow')}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name="add" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchSpinner: {
    marginLeft: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    fontSize: 15,
    color: colors.bright,
    fontFamily: fontFamily.body,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  image: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
  },
  imagePlaceholder: {
    backgroundColor: colors.panel3,
  },
  rowContent: {
    flex: 1,
    marginLeft: spacing.md,
    minWidth: 0,
  },
  followedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
  },
  followBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.blood,
    borderWidth: 1,
    borderColor: colors.bloodBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
