import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

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

export default function BandSearch({
  onFollow,
  followedSpotifyIds,
  placeholder = 'Buscar banda...',
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    SearchedBand[]
  >([]);
  const [searching, setSearching] =
    useState(false);
  const [followingId, setFollowingId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(
      () => doSearch(query.trim()),
      400,
    );
    return () => clearTimeout(timer);
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
      Alert.alert(
        'Error de búsqueda',
        err.message,
      );
    } finally {
      setSearching(false);
    }
  };

  const handleFollow = async (
    band: SearchedBand,
  ) => {
    try {
      setFollowingId(band.spotify_id);
      await onFollow(band);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setFollowingId(null);
    }
  };

  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#666"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
      />

      {searching && (
        <ActivityIndicator
          color="#dc2626"
          style={{ marginVertical: 8 }}
        />
      )}

      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.spotify_id}
          scrollEnabled={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isFollowed =
              followedSpotifyIds.has(
                item.spotify_id,
              );
            const isLoading =
              followingId === item.spotify_id;
            return (
              <View style={styles.row}>
                {item.image_url ? (
                  <Image
                    source={{
                      uri: item.image_url,
                    }}
                    style={styles.image}
                  />
                ) : (
                  <View
                    style={[
                      styles.image,
                      { backgroundColor: '#333' },
                    ]}
                  />
                )}
                <View
                  style={{
                    flex: 1,
                    marginLeft: 12,
                  }}
                >
                  <Text style={styles.name}>
                    {item.name}
                  </Text>
                  {item.genres.length > 0 && (
                    <Text
                      style={styles.genres}
                      numberOfLines={1}
                    >
                      {item.genres
                        .slice(0, 3)
                        .join(' · ')}
                    </Text>
                  )}
                </View>
                {isFollowed ? (
                  <Text
                    style={styles.followedLabel}
                  >
                    Sigues
                  </Text>
                ) : (
                  <TouchableOpacity
                    style={styles.followBtn}
                    onPress={() =>
                      handleFollow(item)
                    }
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator
                        color="#fff"
                        size="small"
                      />
                    ) : (
                      <Text
                        style={
                          styles.followBtnText
                        }
                      >
                        Seguir
                      </Text>
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
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginVertical: 4,
    backgroundColor: '#141414',
  },
  image: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  name: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  genres: {
    color: '#777',
    fontSize: 12,
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  followBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  followedLabel: {
    color: '#777',
    fontSize: 13,
    fontStyle: 'italic',
    marginRight: 6,
  },
});
