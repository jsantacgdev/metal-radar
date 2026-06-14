import { useCallback, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { usePreference } from '../hooks/usePreference';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Button, Text } from '../components/ui';
import { registerForPushNotifications, checkNotificationPermissions } from '../lib/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../i18n/useLanguage';
import { SupportedLanguage } from '../i18n';

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { current: currentLang, changeLanguage } = useLanguage();

  const { session } = useAuth();
  const { profile, update } = useProfile();

  const [radius, setRadius] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [pushStatus, setPushStatus] = useState<
    'granted' | 'denied' | 'undetermined' | 'unsupported' | 'loading' | null
  >(null);

  const { value: skipConfirm, setValue: setSkipConfirm } = usePreference<boolean>(
    'skipUnfollowConfirm',
    false,
  );

  useFocusEffect(
    useCallback(() => {
      refreshPushStatus();
    }, [profile?.push_token]),
  );

  const displayRadius = radius ?? profile?.search_radius_km ?? 500;

  const handleSyncConcerts = async () => {
    try {
      setSyncing(true);
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/sync-concerts`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${s?.access_token}` },
        },
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      Alert.alert(
        t('profile.syncDoneTitle'),
        t('profile.syncDoneBody', {
          synced: json.synced,
          discarded: json.discarded ?? 0,
          skipped: json.bands_skipped ?? 0,
        }),
      );
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSetHomeLocation = async () => {
    try {
      setSavingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permissionDeniedTitle'), t('profile.locationPermissionBody'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      await update({
        home_lat: pos.coords.latitude,
        home_lng: pos.coords.longitude,
      });
      Alert.alert(t('common.done'), t('profile.locationSaved'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSavingLocation(false);
    }
  };

  const handleRadiusComplete = async (value: number) => {
    const rounded = Math.round(value / 10) * 10;
    try {
      await update({ search_radius_km: rounded });
    } catch (err: any) {
      Alert.alert(t('profile.radiusSaveError'), err.message);
    }
  };

  const refreshPushStatus = async () => {
    const sysStatus = await checkNotificationPermissions();

    if (sysStatus !== 'granted') {
      setPushStatus(sysStatus);
      return;
    }

    if (profile?.push_token) {
      setPushStatus('granted');
    } else {
      setPushStatus('undetermined');
    }
  };

  const handleEnableNotifications = async () => {
    setPushStatus('loading');
    const ok = await registerForPushNotifications();
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setPushStatus('granted');
      Alert.alert(t('common.done'), t('profile.notificationsEnabled'));
    } else {
      await refreshPushStatus();
      const status = await checkNotificationPermissions();
      if (status === 'denied') {
        Alert.alert(t('profile.permissionDeniedTitle'), t('profile.notificationsDeniedBody'));
      }
    }
  };

  const handleLogout = () => {
    Alert.alert(t('auth.signOut'), t('profile.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.signOut'),
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  };

  const handleChangeLanguage = async (lang: SupportedLanguage) => {
    try {
      await changeLanguage(lang);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ paddingBottom: spacing.xxxl, paddingTop: spacing.xxxl }}
    >
      {/* Avatar + email */}
      <View style={styles.userBlock}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color={colors.silver} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
          <Text variant="monoMD" color="bloodBright">
            {t('profile.accountLabel')}
          </Text>
          <Text variant="displaySM" numberOfLines={1} style={{ marginTop: 4 }}>
            {session?.user.email ?? '—'}
          </Text>
        </View>
      </View>

      {/* Radio de notificaciones */}
      <View style={styles.section}>
        <Text variant="monoMD" color="muted" style={styles.sectionLabel}>
          {t('profile.notificationRadiusLabel')}
        </Text>
        <Text variant="bodySM" color="muted" style={styles.sectionDesc}>
          {t('profile.notificationRadiusDesc')}
        </Text>

        <View style={styles.radiusDisplay}>
          <Text
            style={{
              fontFamily: fontFamily.displayBold,
              fontSize: 28,
              letterSpacing: -1,
              color: colors.bloodBright,
            }}
          >
            {displayRadius}
          </Text>
          <Text variant="monoMD" color="muted" style={{ marginLeft: spacing.sm }}>
            {t('profile.kmLabel')}
          </Text>
        </View>

        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={50}
          maximumValue={2000}
          step={50}
          value={profile?.search_radius_km ?? 500}
          minimumTrackTintColor={colors.bloodBright}
          maximumTrackTintColor={colors.line}
          thumbTintColor={colors.bloodBright}
          onValueChange={setRadius}
          onSlidingComplete={handleRadiusComplete}
        />
        <View style={styles.sliderLabels}>
          <Text variant="monoSM" color="faint">
            {t('profile.kmValue', { value: 50 })}
          </Text>
          <Text variant="monoSM" color="faint">
            {t('profile.kmValue', { value: 2000 })}
          </Text>
        </View>
      </View>

      {/* Ubicación de referencia */}
      <View style={styles.section}>
        <Text variant="monoMD" color="muted" style={styles.sectionLabel}>
          {t('profile.homeLocationLabel')}
        </Text>
        <Text variant="bodySM" color="muted" style={styles.sectionDesc}>
          {t('profile.homeLocationDesc')}
        </Text>

        <View style={styles.locationCard}>
          <Ionicons
            name="location"
            size={18}
            color={profile?.home_lat ? colors.bloodBright : colors.faint}
          />
          <Text
            variant="body"
            color={profile?.home_lat ? 'silver' : 'faint'}
            style={{ marginLeft: spacing.sm, flex: 1 }}
            numberOfLines={1}
          >
            {profile?.home_lat && profile?.home_lng
              ? `${profile.home_lat.toFixed(3)}, ${profile.home_lng.toFixed(3)}`
              : t('profile.locationNotSet')}
          </Text>
        </View>

        <Button
          label={profile?.home_lat ? t('profile.updateLocation') : t('profile.useCurrentLocation')}
          variant="secondary"
          onPress={handleSetHomeLocation}
          loading={savingLocation}
          icon={<Ionicons name="locate" size={18} color={colors.bright} />}
        />
      </View>

      {/* Preferencias */}
      <View style={styles.section}>
        <Text variant="monoMD" color="muted" style={styles.sectionLabel}>
          {t('profile.preferencesLabel')}
        </Text>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyLG">{t('profile.confirmUnfollowTitle')}</Text>
            <Text variant="bodySM" color="muted" style={{ marginTop: 2 }}>
              {t('profile.confirmUnfollowDesc')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, !skipConfirm && styles.toggleActive]}
            onPress={() => setSkipConfirm(!skipConfirm)}
            activeOpacity={0.7}
          >
            <View style={[styles.toggleKnob, !skipConfirm && styles.toggleKnobActive]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Idioma */}
      <View style={styles.section}>
        <Text variant="monoMD" color="muted" style={styles.sectionLabel}>
          {t('profile.languageLabel')}
        </Text>
        <Text variant="bodySM" color="muted" style={styles.sectionDesc}>
          {t('profile.languageDesc')}
        </Text>

        <View style={styles.langGroup}>
          <LanguageOption
            label={t('profile.languageEs')}
            selected={currentLang === 'es'}
            onPress={() => handleChangeLanguage('es')}
          />
          <View style={styles.langDivider} />
          <LanguageOption
            label={t('profile.languageEn')}
            selected={currentLang === 'en'}
            onPress={() => handleChangeLanguage('en')}
          />
        </View>
      </View>

      {/* Notificaciones */}
      <View style={styles.section}>
        <Text variant="monoMD" color="muted" style={styles.sectionLabel}>
          {t('profile.notificationsLabel')}
        </Text>

        <View style={styles.pushCard}>
          <Ionicons
            name={pushStatus === 'granted' ? 'notifications' : 'notifications-off-outline'}
            size={20}
            color={pushStatus === 'granted' ? colors.bloodBright : colors.faint}
          />
          <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
            <Text variant="body">
              {pushStatus === 'granted' && t('profile.pushGranted')}
              {pushStatus === 'denied' && t('profile.pushDenied')}
              {pushStatus === 'undetermined' && t('profile.pushUndetermined')}
              {pushStatus === 'unsupported' && t('profile.pushUnsupported')}
              {pushStatus === 'loading' && t('profile.pushLoading')}
            </Text>
            <Text variant="bodySM" color="muted" style={{ marginTop: 2 }}>
              {pushStatus === 'granted'
                ? t('profile.pushGrantedDesc')
                : t('profile.pushDisabledDesc')}
            </Text>
          </View>
        </View>

        {pushStatus !== 'granted' && pushStatus !== 'unsupported' && pushStatus !== 'loading' && (
          <View style={{ marginTop: spacing.md }}>
            <Button
              label={
                pushStatus === 'denied'
                  ? t('profile.openSettings')
                  : t('profile.enableNotifications')
              }
              onPress={
                pushStatus === 'denied' ? () => Linking.openSettings() : handleEnableNotifications
              }
              icon={<Ionicons name="notifications" size={18} color="#fff" />}
            />
          </View>
        )}
      </View>

      {/* Acciones */}
      <View style={styles.section}>
        <Text variant="monoMD" color="muted" style={styles.sectionLabel}>
          {t('profile.maintenanceLabel')}
        </Text>

        <Button
          label={t('profile.syncConcerts')}
          onPress={handleSyncConcerts}
          loading={syncing}
          icon={<Ionicons name="sync" size={18} color="#fff" />}
        />

        <View style={{ height: spacing.sm }} />

        <Button
          label={t('auth.signOut')}
          variant="ghost"
          onPress={handleLogout}
          icon={<Ionicons name="log-out-outline" size={18} color={colors.silver} />}
        />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text variant="monoSM" color="faint" style={{ textAlign: 'center' }}>
          {t('profile.footerTagline')}
        </Text>
      </View>
    </ScrollView>
  );
}

// Componente auxiliar para opciones de idioma
function LanguageOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.langRow, selected && styles.langRowSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text variant="body" color={selected ? 'bloodBright' : 'silver'} style={{ flex: 1 }}>
        {label}
      </Text>
      {selected && <Ionicons name="checkmark" size={20} color={colors.bloodBright} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  userBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
  },
  sectionDesc: {
    marginBottom: spacing.lg,
  },
  radiusDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingHorizontal: 4,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: colors.blood,
    borderColor: colors.bloodBright,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.faint,
  },
  toggleKnobActive: {
    backgroundColor: '#fff',
    alignSelf: 'flex-end',
  },
  footer: {
    marginTop: spacing.xxxl,
  },
  pushCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  langGroup: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  langRowSelected: {
    backgroundColor: colors.panel2,
  },
  langDivider: {
    height: 1,
    backgroundColor: colors.line,
  },
});
