import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useProfile, useUsernameAvailability } from '../hooks/useProfile';
import { usePreference } from '../hooks/usePreference';
import { useSpotifyAuth } from '../hooks/useSpotifyAuth';
import { useLanguage } from '../i18n/useLanguage';
import { SupportedLanguage } from '../i18n';
import { registerForPushNotifications, checkNotificationPermissions } from '../lib/notifications';
import { privacyUrl, termsUrl } from '../lib/legalUrls';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Button, Text } from '../components/ui';

export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const { current: currentLang, changeLanguage } = useLanguage();
  const navigation = useNavigation();

  const { session } = useAuth();
  const { profile, update } = useProfile();

  const {
    user: spotifyUser,
    isConnected: isSpotifyConnected,
    loading: spotifyLoading,
    connect: connectSpotify,
    disconnect: disconnectSpotify,
  } = useSpotifyAuth();

  const [radius, setRadius] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameInitialized, setUsernameInitialized] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const usernameAvailability = useUsernameAvailability(usernameInput, profile?.username ?? null);
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

  useEffect(() => {
    if (!usernameInitialized && profile) {
      setUsernameInput(profile.username ?? '');
      setUsernameInitialized(true);
    }
  }, [profile, usernameInitialized]);

  const displayRadius = radius ?? profile?.search_radius_km ?? 500;

  const handleTogglePrivate = async () => {
    try {
      await update({ is_private: !profile?.is_private });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleSaveUsername = async () => {
    try {
      setSavingUsername(true);
      await update({ username: usernameInput.trim().toLowerCase() });
      Alert.alert(t('common.done'), t('profile.usernameSaved'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSavingUsername(false);
    }
  };

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
    if (profile?.push_token) setPushStatus('granted');
    else setPushStatus('undetermined');
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

  const handleChangeLanguage = async (lang: SupportedLanguage) => {
    try {
      await changeLanguage(lang);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleConnectSpotify = async () => {
    setSpotifyBusy(true);
    try {
      await connectSpotify();
    } catch (err: any) {
      if (err.message !== 'Cancelado') {
        Alert.alert(t('common.error'), err.message);
      }
    } finally {
      setSpotifyBusy(false);
    }
  };

  const handleDisconnectSpotify = () => {
    Alert.alert(t('profile.spotifyDisconnectTitle'), t('profile.spotifyDisconnectBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.spotifyDisconnect'),
        style: 'destructive',
        onPress: async () => {
          setSpotifyBusy(true);
          try {
            await disconnectSpotify();
          } finally {
            setSpotifyBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
    >
      <View style={styles.titleWrap}>
        <Text variant="displayLG">{t('settings.title')}</Text>
        <Text variant="bodySM" color="muted" style={{ marginTop: 4 }}>
          {session?.user.email}
        </Text>
      </View>

      {/* CUENTA */}
      <Text variant="monoMD" color="bloodBright" style={styles.categoryHeader}>
        {t('settings.accountCategory')}
      </Text>
      <View style={styles.section}>
        <Text variant="bodySM" color="muted" style={styles.sectionDesc}>
          {t('profile.usernameDesc')}
        </Text>
        <TextInput
          style={styles.usernameInput}
          value={usernameInput}
          onChangeText={(text) => setUsernameInput(text.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('profile.usernamePlaceholder')}
          placeholderTextColor={colors.faint}
          maxLength={20}
        />
        {usernameAvailability !== 'idle' && (
          <Text
            variant="bodySM"
            color={
              usernameAvailability === 'available'
                ? 'bloodBright'
                : usernameAvailability === 'checking'
                  ? 'muted'
                  : 'faint'
            }
            style={{ marginTop: spacing.xs }}
          >
            {usernameAvailability === 'checking' && t('profile.usernameChecking')}
            {usernameAvailability === 'available' && t('profile.usernameAvailable')}
            {usernameAvailability === 'taken' && t('profile.usernameTaken')}
            {usernameAvailability === 'invalid' && t('profile.usernameInvalid')}
            {usernameAvailability === 'error' && t('profile.usernameCheckError')}
          </Text>
        )}
        <View style={{ marginTop: spacing.md }}>
          <Button
            label={t('profile.usernameSave')}
            onPress={handleSaveUsername}
            loading={savingUsername}
            disabled={usernameAvailability !== 'available' || savingUsername}
            icon={<Ionicons name="at" size={18} color="#fff" />}
            style={usernameAvailability !== 'available' ? { opacity: 0.5 } : undefined}
          />
        </View>
      </View>

      {/* UBICACIÓN */}
      <Text variant="monoMD" color="bloodBright" style={styles.categoryHeader}>
        {t('settings.locationCategory')}
      </Text>
      <View style={styles.section}>
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

      {/* NOTIFICACIONES */}
      <Text variant="monoMD" color="bloodBright" style={styles.categoryHeader}>
        {t('settings.notificationsCategory')}
      </Text>
      <View style={styles.section}>
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

        {/* Radio */}
        <View style={{ marginTop: spacing.xl }}>
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
      </View>

      {/* SPOTIFY */}
      <Text variant="monoMD" color="bloodBright" style={styles.categoryHeader}>
        {t('settings.spotifyCategory')}
      </Text>
      <View style={styles.section}>
        <Text variant="bodySM" color="muted" style={styles.sectionDesc}>
          {t('profile.spotifyDesc')}
        </Text>
        <View style={styles.spotifyCard}>
          {isSpotifyConnected && spotifyUser?.image_url ? (
            <Image source={{ uri: spotifyUser.image_url }} style={styles.spotifyAvatar} />
          ) : (
            <View style={styles.spotifyAvatarPlaceholder}>
              <Ionicons
                name="musical-notes"
                size={20}
                color={isSpotifyConnected ? '#1DB954' : colors.faint}
              />
            </View>
          )}
          <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
            <Text variant="body">
              {isSpotifyConnected
                ? (spotifyUser?.display_name ?? t('profile.spotifyConnected'))
                : t('profile.spotifyNotConnected')}
            </Text>
            <Text variant="bodySM" color="muted" style={{ marginTop: 2 }} numberOfLines={1}>
              {isSpotifyConnected
                ? (spotifyUser?.email ?? t('profile.spotifyConnectedDesc'))
                : t('profile.spotifyDisconnectedDesc')}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: spacing.md }}>
          {isSpotifyConnected ? (
            <Button
              label={t('profile.spotifyDisconnect')}
              variant="ghost"
              onPress={handleDisconnectSpotify}
              loading={spotifyBusy}
              icon={<Ionicons name="log-out-outline" size={18} color={colors.silver} />}
            />
          ) : (
            <Button
              label={t('profile.spotifyConnect')}
              onPress={handleConnectSpotify}
              loading={spotifyBusy || spotifyLoading}
              icon={<Ionicons name="musical-notes" size={18} color="#fff" />}
            />
          )}
        </View>
      </View>

      {/* IDIOMA */}
      <Text variant="monoMD" color="bloodBright" style={styles.categoryHeader}>
        {t('settings.languageCategory')}
      </Text>
      <View style={styles.section}>
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

      {/* PREFERENCIAS */}
      <Text variant="monoMD" color="bloodBright" style={styles.categoryHeader}>
        {t('settings.preferencesCategory')}
      </Text>
      <View style={styles.section}>
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

        <View style={[styles.toggleRow, { marginTop: spacing.lg }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyLG">{t('settings.privateAccount')}</Text>
            <Text variant="bodySM" color="muted" style={{ marginTop: 2 }}>
              {t('settings.privateAccountDesc')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, profile?.is_private && styles.toggleActive]}
            onPress={handleTogglePrivate}
            activeOpacity={0.7}
          >
            <View style={[styles.toggleKnob, profile?.is_private && styles.toggleKnobActive]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* MANTENIMIENTO */}
      <Text variant="monoMD" color="bloodBright" style={styles.categoryHeader}>
        {t('settings.maintenanceCategory')}
      </Text>
      <View style={styles.section}>
        <Button
          label={t('profile.syncConcerts')}
          onPress={handleSyncConcerts}
          loading={syncing}
          icon={<Ionicons name="sync" size={18} color="#fff" />}
        />
      </View>

      {/* LEGAL */}
      <Text variant="monoMD" color="bloodBright" style={styles.categoryHeader}>
        {t('settings.legalCategory')}
      </Text>
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.legalRow}
          onPress={() => Linking.openURL(privacyUrl(i18n.language))}
          activeOpacity={0.7}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.silver} />
          <Text variant="body" color="silver" style={{ flex: 1, marginLeft: spacing.md }}>
            {t('profile.privacyPolicy')}
          </Text>
          <Ionicons name="open-outline" size={16} color={colors.muted} />
        </TouchableOpacity>

        <View style={styles.legalDivider} />

        <TouchableOpacity
          style={styles.legalRow}
          onPress={() => Linking.openURL(termsUrl(i18n.language))}
          activeOpacity={0.7}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.silver} />
          <Text variant="body" color="silver" style={{ flex: 1, marginLeft: spacing.md }}>
            {t('profile.termsOfUse')}
          </Text>
          <Ionicons name="open-outline" size={16} color={colors.muted} />
        </TouchableOpacity>
      </View>

      {/* ZONA PELIGROSA */}
      <Text variant="monoMD" color="bloodBright" style={styles.categoryHeader}>
        {t('settings.dangerCategory')}
      </Text>
      <View style={styles.section}>
        <Text variant="bodySM" color="muted" style={styles.sectionDesc}>
          {t('profile.dangerZoneDesc')}
        </Text>
        <Button
          label={t('profile.deleteAccountButton')}
          variant="ghost"
          onPress={() => navigation.navigate('DeleteAccount' as never)}
          icon={<Ionicons name="trash-outline" size={18} color={colors.bloodBright} />}
        />
      </View>
    </ScrollView>
  );
}

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
  titleWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  categoryHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    letterSpacing: 1,
  },
  section: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  sectionDesc: {
    marginBottom: spacing.md,
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
  usernameInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.bright,
    fontFamily: fontFamily.mono,
    fontSize: 15,
    backgroundColor: colors.panel,
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
  pushCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  spotifyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  spotifyAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
  },
  spotifyAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
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
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  legalDivider: {
    height: 1,
    backgroundColor: colors.lineSoft,
  },
});
