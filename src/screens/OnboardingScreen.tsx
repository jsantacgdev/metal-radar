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
import { useQueryClient } from '@tanstack/react-query';

type Band = {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
};

export default function OnboardingScreen({
  onDone,
}: {
  onDone: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Band[]>(
    [],
  );
  const [searching, setSearching] =
    useState(false);
  const [selected, setSelected] = useState<
    Map<string, Band>
  >(new Map());
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

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
      const { data, error } =
        await supabase.functions.invoke(
          'search-bands',
          {
            method: 'GET',
          } as any,
        );

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

  const toggleBand = (band: Band) => {
    const next = new Map(selected);
    if (next.has(band.spotify_id))
      next.delete(band.spotify_id);
    else next.set(band.spotify_id, band);
    setSelected(next);
  };

  const canContinue = selected.size >= 3;

  const handleContinue = async () => {
    if (!canContinue) return;
    try {
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user)
        throw new Error('Sesión no encontrada');

      const bandsArray = Array.from(
        selected.values(),
      );

      const {
        data: insertedBands,
        error: bandsError,
      } = await supabase
        .from('bands')
        .upsert(
          bandsArray.map((b) => ({
            spotify_id: b.spotify_id,
            name: b.name,
            image_url: b.image_url,
            genres: b.genres,
          })),
          { onConflict: 'spotify_id' },
        )
        .select('id, spotify_id');

      if (bandsError) throw bandsError;

      const { error: followError } =
        await supabase.from('user_bands').upsert(
          insertedBands!.map((b) => ({
            user_id: user.id,
            band_id: b.id,
          })),
          { onConflict: 'user_id,band_id' },
        );

      if (followError) throw followError;

      queryClient.invalidateQueries({
        queryKey: ['followedBands'],
      });
      queryClient.invalidateQueries({
        queryKey: ['recommendations'],
      });

      onDone();
    } catch (err: any) {
      Alert.alert(
        'Error al guardar',
        err.message,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Elige tus bandas
      </Text>
      <Text style={styles.subtitle}>
        Mínimo 3 para empezar ({selected.size}{' '}
        seleccionadas)
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Buscar banda..."
        placeholderTextColor="#666"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
      />

      {searching && (
        <ActivityIndicator
          color="#dc2626"
          style={{ marginVertical: 12 }}
        />
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.spotify_id}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isSelected = selected.has(
            item.spotify_id,
          );
          return (
            <TouchableOpacity
              style={[
                styles.bandRow,
                isSelected &&
                  styles.bandRowSelected,
              ]}
              onPress={() => toggleBand(item)}
            >
              {item.image_url ? (
                <Image
                  source={{ uri: item.image_url }}
                  style={styles.bandImage}
                />
              ) : (
                <View
                  style={[
                    styles.bandImage,
                    styles.bandImagePlaceholder,
                  ]}
                />
              )}
              <View
                style={{
                  flex: 1,
                  marginLeft: 12,
                }}
              >
                <Text style={styles.bandName}>
                  {item.name}
                </Text>
                {item.genres.length > 0 && (
                  <Text
                    style={styles.bandGenres}
                    numberOfLines={1}
                  >
                    {item.genres
                      .slice(0, 3)
                      .join(' · ')}
                  </Text>
                )}
              </View>
              <Text style={styles.checkMark}>
                {isSelected ? '✓' : '+'}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !searching && query.length >= 2 ? (
            <Text style={styles.emptyText}>
              Sin resultados
            </Text>
          ) : null
        }
      />

      <TouchableOpacity
        style={[
          styles.continueButton,
          (!canContinue || saving) && {
            opacity: 0.4,
          },
        ]}
        onPress={handleContinue}
        disabled={!canContinue || saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.continueText}>
            Continuar
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    color: '#999',
    marginTop: 4,
    marginBottom: 20,
  },
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
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginVertical: 4,
    backgroundColor: '#141414',
  },
  bandRowSelected: {
    backgroundColor: '#2a0e0e',
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  bandImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#222',
  },
  bandImagePlaceholder: {
    backgroundColor: '#333',
  },
  bandName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bandGenres: {
    color: '#777',
    fontSize: 12,
    marginTop: 2,
  },
  checkMark: {
    color: '#dc2626',
    fontSize: 22,
    fontWeight: 'bold',
    marginRight: 8,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  continueButton: {
    backgroundColor: '#dc2626',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  continueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
