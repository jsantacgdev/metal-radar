import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { SubmitConcertBand } from '../hooks/useSubmitConcert';

type SearchResult = { id: string; name: string; image_url: string | null };

type Props = {
  bands: SubmitConcertBand[];
  onChange: (bands: SubmitConcertBand[]) => void;
  showFollowToggle?: boolean;
};

export default function BandLineupPicker({ bands, onChange, showFollowToggle = true }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => doSearch(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const doSearch = async (q: string) => {
    try {
      setSearching(true);
      const { data, error } = await supabase
        .from('bands')
        .select('id, name, image_url')
        .ilike('name', `${q}%`)
        .limit(10);
      if (error) throw error;
      setResults(data ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addBand = (band: SubmitConcertBand) => {
    onChange([...bands, { ...band, is_headliner: bands.length === 0 }]);
    setQuery('');
    setResults([]);
  };

  const removeBand = (index: number) => {
    const next = bands.filter((_, i) => i !== index);
    if (next.length > 0 && !next.some((b) => b.is_headliner)) next[0].is_headliner = true;
    onChange(next);
  };

  const makeHeadliner = (index: number) => {
    onChange(bands.map((b, i) => ({ ...b, is_headliner: i === index })));
  };

  const toggleFollow = (index: number) => {
    onChange(bands.map((b, i) => (i === index ? { ...b, follow: !b.follow } : b)));
  };

  const alreadyAdded = (name: string) =>
    bands.some((b) => b.name.trim().toLowerCase() === name.trim().toLowerCase());

  return (
    <View>
      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={16} color={colors.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder={t('addConcert.bandsHint')}
          placeholderTextColor={colors.faint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
        />
        {searching && <ActivityIndicator color={colors.bloodBright} size="small" />}
      </View>

      {query.trim().length >= 2 && (
        <View style={styles.dropdown}>
          <FlatList
            data={results.filter((r) => !alreadyAdded(r.name))}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultRow}
                onPress={() =>
                  addBand({
                    name: item.name,
                    matched_band_id: item.id,
                    image_url: item.image_url,
                    is_headliner: false,
                    follow: true,
                  })
                }
              >
                <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name}
                </Text>
                <Ionicons name="add-circle-outline" size={18} color={colors.bloodBright} />
              </TouchableOpacity>
            )}
          />
          {!alreadyAdded(query.trim()) && (
            <TouchableOpacity
              style={styles.resultRow}
              onPress={() =>
                addBand({
                  name: query.trim(),
                  matched_band_id: null,
                  image_url: null,
                  is_headliner: false,
                  follow: true,
                })
              }
            >
              <Text variant="body" color="muted" numberOfLines={1} style={{ flex: 1 }}>
                {t('addConcert.addBandAsNew', { name: query.trim() })}
              </Text>
              <Ionicons name="add-circle-outline" size={18} color={colors.silver} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {bands.length > 0 && (
        <View style={{ marginTop: spacing.md }}>
          {bands.map((band, index) => (
            <View key={`${band.name}-${index}`} style={styles.bandRow}>
              <View
                style={[
                  styles.matchDot,
                  { backgroundColor: band.matched_band_id ? '#21c577' : '#5694ff' },
                ]}
              />
              <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                {band.name}
              </Text>
              {showFollowToggle && (
                <TouchableOpacity
                  onPress={() => toggleFollow(index)}
                  hitSlop={8}
                  style={styles.followTag}
                >
                  <Ionicons
                    name={band.follow ? 'checkbox' : 'square-outline'}
                    size={16}
                    color={band.follow ? colors.bloodBright : colors.muted}
                  />
                  <Text variant="monoSM" color={band.follow ? 'bloodBright' : 'muted'}>
                    {t('addConcert.followBandCheckbox')}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => makeHeadliner(index)}
                style={[
                  styles.tierTag,
                  { borderColor: band.is_headliner ? colors.bloodBright : colors.line },
                ]}
                hitSlop={6}
              >
                <Text
                  variant="monoSM"
                  style={{ color: band.is_headliner ? colors.bloodBright : colors.muted }}
                >
                  {band.is_headliner
                    ? t('addConcert.headlinerBadge')
                    : t('addConcert.supportBadge')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => removeBand(index)}
                style={styles.removeBtn}
                hitSlop={10}
              >
                <Ionicons name="close" size={18} color={colors.faint} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
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
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.bright,
    fontFamily: fontFamily.body,
  },
  dropdown: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    gap: spacing.sm,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    gap: 10,
  },
  matchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  followTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  tierTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  removeBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
});
