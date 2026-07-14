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
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Button, FormField, Text } from '../components/ui';
import { registerForPushNotifications } from '../lib/notifications';
import { followBand } from '../lib/bands';
import { useProfile, useUsernameAvailability } from '../hooks/useProfile';

type Band = {
  spotify_id: string | null;
  name: string;
  image_url: string | null;
  genres: string[];
};

// Algunas bandas en caché (sobre todo las que no tienen foto) no
// tienen spotify_id — usarlo tal cual como clave hace que varias
// bandas distintas colisionen bajo la misma clave `null`.
function bandKey(band: Band): string {
  return band.spotify_id ?? `name:${band.name.toLowerCase()}`;
}

type Step = 'username' | 'bands' | 'notifications';

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('username');

  const { profile, loading: profileLoading, update } = useProfile();
  const [usernameInput, setUsernameInput] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const usernameAvailability = useUsernameAvailability(usernameInput, profile?.username ?? null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Band[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, Band>>(new Map());
  const [saving, setSaving] = useState(false);

  const [enablingPush, setEnablingPush] = useState(false);

  useEffect(() => {
    // Ya tiene username (p.ej. cuenta antigua sin bandas seguidas
    // todavía) — no repetir este paso.
    if (!profileLoading && profile?.username && step === 'username') {
      setStep('bands');
    }
  }, [profileLoading, profile?.username, step]);

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
      Alert.alert(t('onboarding.searchErrorTitle'), err.message);
    } finally {
      setSearching(false);
    }
  };

  const toggleBand = (band: Band) => {
    const next = new Map(selected);
    const key = bandKey(band);
    if (next.has(key)) next.delete(key);
    else next.set(key, band);
    setSelected(next);
  };

  const canContinue = selected.size >= 3;

  const handleBandsContinue = async () => {
    if (!canContinue) return;
    try {
      setSaving(true);
      const bandsArray = Array.from(selected.values());

      for (const band of bandsArray) {
        await followBand(band);
      }

      queryClient.invalidateQueries({ queryKey: ['followedBands'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });

      setStep('notifications');
    } catch (err: any) {
      Alert.alert(t('onboarding.saveErrorTitle'), err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEnableNotifications = async () => {
    try {
      setEnablingPush(true);
      const ok = await registerForPushNotifications();
      if (!ok) {
        Alert.alert(t('onboarding.pushDisabledTitle'), t('onboarding.pushDisabledBody'));
      }
    } catch (err: any) {
      console.warn('Error activando notificaciones:', err);
    } finally {
      setEnablingPush(false);
      onDone();
    }
  };

  const handleSkipNotifications = () => {
    onDone();
  };

  const handleUsernameContinue = async () => {
    if (usernameAvailability !== 'available') return;
    try {
      setSavingUsername(true);
      await update({ username: usernameInput.trim().toLowerCase() });
      setStep('bands');
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSavingUsername(false);
    }
  };

  if (step === 'username') {
    return (
      <View style={[styles.container, { justifyContent: 'space-between' }]}>
        <View>
          <View style={styles.header}>
            <Text variant="monoMD" color="bloodBright">
              {t('onboarding.usernameEyebrow')}
            </Text>
            <Text variant="displayLG" style={styles.title}>
              {t('onboarding.usernameTitle')}
            </Text>
            <Text variant="body" color="muted" style={styles.subtitle}>
              {t('onboarding.usernameSubtitle')}
            </Text>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <FormField
              label={t('profile.usernamePlaceholder')}
              placeholder={t('profile.usernamePlaceholder')}
              value={usernameInput}
              onChangeText={(text) => setUsernameInput(text.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              autoFocus
              error={
                usernameAvailability === 'taken'
                  ? t('profile.usernameTaken')
                  : usernameAvailability === 'invalid'
                    ? t('profile.usernameInvalid')
                    : usernameAvailability === 'error'
                      ? t('profile.usernameCheckError')
                      : undefined
              }
            />
            {usernameAvailability === 'checking' && (
              <Text
                variant="bodySM"
                color="muted"
                style={{ marginTop: spacing.xs, paddingLeft: spacing.xs }}
              >
                {t('profile.usernameChecking')}
              </Text>
            )}
            {usernameAvailability === 'available' && (
              <Text
                variant="bodySM"
                color="bloodBright"
                style={{ marginTop: spacing.xs, paddingLeft: spacing.xs }}
              >
                {t('profile.usernameAvailable')}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.footer}>
          <Button
            label={t('onboarding.continueButton')}
            onPress={handleUsernameContinue}
            loading={savingUsername}
            disabled={usernameAvailability !== 'available'}
          />
        </View>
      </View>
    );
  }

  if (step === 'bands') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="monoMD" color="bloodBright">
            {t('onboarding.step1Eyebrow')}
          </Text>
          <Text variant="displayLG" style={styles.title}>
            {t('onboarding.step1Title')}
          </Text>
          <Text variant="body" color="muted" style={styles.subtitle}>
            {t('onboarding.step1Subtitle')}
          </Text>

          <View style={styles.counter}>
            <Text variant="displayMD" color="bloodBright">
              {selected.size}
            </Text>
            <Text variant="monoSM" color="muted" style={{ marginLeft: 6 }}>
              {t('onboarding.selectedLabel')}
            </Text>
          </View>
        </View>

        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.input}
            placeholder={t('onboarding.searchPlaceholder')}
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
          keyExtractor={(item, index) => item.spotify_id ?? `name-${item.name}-${index}`}
          style={{ flex: 1, marginTop: spacing.md }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          renderItem={({ item }) => {
            const isSelected = selected.has(bandKey(item));
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
                  {(item.genres?.length ?? 0) > 0 && (
                    <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 4 }}>
                      {(item.genres ?? []).slice(0, 2).join(' · ')}
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
                {t('onboarding.noResults')}
              </Text>
            ) : null
          }
        />

        <View style={styles.footer}>
          <Button
            label={
              canContinue
                ? t('onboarding.continueButton')
                : t('onboarding.missingBands', { count: 3 - selected.size })
            }
            onPress={handleBandsContinue}
            loading={saving}
            disabled={!canContinue}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { justifyContent: 'space-between' }]}>
      <View style={styles.notifHeader}>
        <Text variant="monoMD" color="bloodBright">
          {t('onboarding.step2Eyebrow')}
        </Text>
        <Text variant="displayLG" style={styles.title}>
          {t('onboarding.step2Title')}
        </Text>
      </View>

      <View style={styles.notifContent}>
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Ionicons name="notifications" size={48} color={colors.bloodBright} />
          </View>
        </View>

        <View style={styles.featureList}>
          <View style={styles.featureRow}>
            <Ionicons name="radio" size={18} color={colors.bloodBright} />
            <Text variant="body" style={{ marginLeft: spacing.md, flex: 1 }}>
              {t('onboarding.feature1')}
            </Text>
          </View>

          <View style={styles.featureRow}>
            <Ionicons name="location" size={18} color={colors.bloodBright} />
            <Text variant="body" style={{ marginLeft: spacing.md, flex: 1 }}>
              {t('onboarding.feature2')}
            </Text>
          </View>

          <View style={styles.featureRow}>
            <Ionicons name="moon-outline" size={18} color={colors.bloodBright} />
            <Text variant="body" style={{ marginLeft: spacing.md, flex: 1 }}>
              {t('onboarding.feature3')}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          label={t('onboarding.enableNotifications')}
          onPress={handleEnableNotifications}
          loading={enablingPush}
          icon={<Ionicons name="notifications" size={18} color="#fff" />}
        />
        <View style={{ height: spacing.sm }} />
        <Button
          label={t('onboarding.notNow')}
          variant="ghost"
          onPress={handleSkipNotifications}
          disabled={enablingPush}
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
  notifHeader: {
    marginTop: spacing.lg,
  },
  notifContent: {
    flex: 1,
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.bloodTint,
    borderWidth: 2,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureList: {
    gap: spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.sm,
  },
});
