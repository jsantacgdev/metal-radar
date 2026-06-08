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
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Button, Text } from '../components/ui';

type Band = {
  spotify_id: string;
  name: string;
  image_url: string | null;
  genres: string[];
};

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Band[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, Band>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => doSearch(query.trim()), 800);
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
      Alert.alert('Error de búsqueda', err.message);
    } finally {
      setSearching(false);
    }
  };

  const toggleBand = (band: Band) => {
    const next = new Map(selected);
    if (next.has(band.spotify_id)) next.delete(band.spotify_id);
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
      if (!user) throw new Error('Sesión no encontrada');

      const bandsArray = Array.from(selected.values());

      const { data: insertedBands, error: bandsError } = await supabase
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

      const { error: followError } = await supabase.from('user_bands').upsert(
        insertedBands!.map((b) => ({ user_id: user.id, band_id: b.id })),
        { onConflict: 'user_id,band_id' },
      );

      if (followError) throw followError;

      queryClient.invalidateQueries({ queryKey: ['followedBands'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      onDone();
    } catch (err: any) {
      Alert.alert('Error al guardar', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="monoMD" color="bloodBright">
          PASO 1 · TU PERFIL
        </Text>
        <Text variant="displayLG" style={styles.title}>
          Elige tus{'\n'}bandas
        </Text>
        <Text variant="body" color="muted" style={styles.subtitle}>
          Mínimo 3 para empezar a descubrir conciertos
        </Text>

        <View style={styles.counter}>
          <Text variant="displayMD" color="bloodBright">
            {selected.size}
          </Text>
          <Text variant="monoSM" color="muted" style={{ marginLeft: 6 }}>
            SELECCIONADAS
          </Text>
        </View>
      </View>

      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder="Buscar banda..."
          placeholderTextColor={colors.faint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
        />
        {searching && (
          <ActivityIndicator color={colors.bloodBright} style={{ marginLeft: spacing.sm }} />
        )}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.spotify_id}
        style={{ flex: 1, marginTop: spacing.md }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.spotify_id);
          return (
            <TouchableOpacity
              style={[styles.bandRow, isSelected && styles.bandRowSelected]}
              onPress={() => toggleBand(item)}
              activeOpacity={0.7}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.bandImage} />
              ) : (
                <View style={[styles.bandImage, { backgroundColor: colors.panel3 }]} />
              )}
              <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
                <Text variant="displaySM" numberOfLines={1}>
                  {item.name}
                </Text>
                {item.genres.length > 0 && (
                  <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 4 }}>
                    {item.genres.slice(0, 2).join(' · ')}
                  </Text>
                )}
              </View>
              <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                <Ionicons
                  name={isSelected ? 'checkmark' : 'add'}
                  size={18}
                  color={isSelected ? '#fff' : colors.silver}
                />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !searching && query.length >= 2 ? (
            <Text
              variant="monoMD"
              color="muted"
              style={{ textAlign: 'center', marginTop: spacing.xl }}
            >
              SIN RESULTADOS
            </Text>
          ) : null
        }
      />

      <View style={styles.footer}>
        <Button
          label={canContinue ? 'Continuar' : `Faltan ${3 - selected.size} bandas`}
          onPress={handleContinue}
          loading={saving}
          disabled={!canContinue}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.xl,
    paddingTop: 70,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    marginTop: spacing.md,
  },
  subtitle: {
    marginTop: spacing.sm,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.lg,
  },
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
  input: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    fontSize: 15,
    color: colors.bright,
    fontFamily: fontFamily.body,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bandRowSelected: {
    backgroundColor: colors.bloodTint,
    borderColor: colors.bloodTintBorder,
  },
  bandImage: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkCircleSelected: {
    backgroundColor: colors.blood,
    borderColor: colors.bloodBright,
  },
  footer: {
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxl + spacing.md,
  },
});
