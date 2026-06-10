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
import { useEffect } from 'react';
import { registerForPushNotifications, checkNotificationPermissions } from '../lib/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';

export default function ProfileScreen() {
  const queryClient = useQueryClient();

  const { session } = useAuth();
  const { profile, update } = useProfile();

  const [radius, setRadius] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [pushStatus, setPushStatus] = useState<
    'granted' | 'denied' | 'undetermined' | 'unsupported' | 'loading'
  >('loading');

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
        'Sincronización completada',
        `Conciertos: ${json.synced}\nDescartados: ${json.discarded ?? 0}\nBandas saltadas: ${json.bands_skipped ?? 0}`,
      );
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSetHomeLocation = async () => {
    try {
      setSavingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a la ubicación');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      await update({
        home_lat: pos.coords.latitude,
        home_lng: pos.coords.longitude,
      });
      Alert.alert('Listo', 'Ubicación de referencia guardada');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingLocation(false);
    }
  };

  const handleRadiusComplete = async (value: number) => {
    const rounded = Math.round(value / 10) * 10;
    try {
      await update({ search_radius_km: rounded });
    } catch (err: any) {
      Alert.alert('Error al guardar radio', err.message);
    }
  };

  const refreshPushStatus = async () => {
    const sysStatus = await checkNotificationPermissions();

    if (sysStatus !== 'granted') {
      setPushStatus(sysStatus);
      return;
    }

    // Sistema dice "granted" → verificar que también tenemos token en BD
    if (profile?.push_token) {
      setPushStatus('granted');
    } else {
      // Permiso concedido pero sin token guardado → tratar como undetermined
      setPushStatus('undetermined');
    }
  };

  const handleEnableNotifications = async () => {
    setPushStatus('loading');
    const ok = await registerForPushNotifications();
    if (ok) {
      // Invalidar el cache de profile para que se recargue con el nuevo push_token
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setPushStatus('granted');
      Alert.alert('Listo', 'Notificaciones activadas');
    } else {
      await refreshPushStatus();
      const status = await checkNotificationPermissions();
      if (status === 'denied') {
        Alert.alert(
          'Permisos denegados',
          'Para activarlas tienes que ir a los ajustes del sistema y dar permiso a Metal Radar',
        );
      }
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
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
            CUENTA
          </Text>
          <Text variant="displaySM" numberOfLines={1} style={{ marginTop: 4 }}>
            {session?.user.email ?? '—'}
          </Text>
        </View>
      </View>

      {/* Radio de notificaciones */}
      <View style={styles.section}>
        <Text variant="monoMD" color="muted" style={styles.sectionLabel}>
          RADIO DE NOTIFICACIONES
        </Text>
        <Text variant="bodySM" color="muted" style={styles.sectionDesc}>
          Distancia máxima para avisarte de conciertos cerca de tu ubicación de referencia
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
            KM
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
            50 KM
          </Text>
          <Text variant="monoSM" color="faint">
            2000 KM
          </Text>
        </View>
      </View>

      {/* Ubicación de referencia */}
      <View style={styles.section}>
        <Text variant="monoMD" color="muted" style={styles.sectionLabel}>
          UBICACIÓN DE REFERENCIA
        </Text>
        <Text variant="bodySM" color="muted" style={styles.sectionDesc}>
          Solo para notificaciones. El mapa usa siempre tu ubicación actual.
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
              : 'Sin establecer'}
          </Text>
        </View>

        <Button
          label={profile?.home_lat ? 'Actualizar ubicación' : 'Usar mi ubicación actual'}
          variant="secondary"
          onPress={handleSetHomeLocation}
          loading={savingLocation}
          icon={<Ionicons name="locate" size={18} color={colors.bright} />}
        />
      </View>

      {/* Preferencias */}
      <View style={styles.section}>
        <Text variant="monoMD" color="muted" style={styles.sectionLabel}>
          PREFERENCIAS
        </Text>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyLG">Confirmar al quitar bandas</Text>
            <Text variant="bodySM" color="muted" style={{ marginTop: 2 }}>
              Pregunta antes de dejar de seguir
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

      {/* Notificaciones */}
      <View style={styles.section}>
        <Text variant="monoMD" color="muted" style={styles.sectionLabel}>
          NOTIFICACIONES
        </Text>

        <View style={styles.pushCard}>
          <Ionicons
            name={pushStatus === 'granted' ? 'notifications' : 'notifications-off-outline'}
            size={20}
            color={pushStatus === 'granted' ? colors.bloodBright : colors.faint}
          />
          <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
            <Text variant="body">
              {pushStatus === 'granted' && 'Notificaciones activadas'}
              {pushStatus === 'denied' && 'Notificaciones bloqueadas'}
              {pushStatus === 'undetermined' && 'Notificaciones desactivadas'}
              {pushStatus === 'unsupported' && 'No disponibles en Expo Go'}
              {pushStatus === 'loading' && 'Comprobando…'}
            </Text>
            <Text variant="bodySM" color="muted" style={{ marginTop: 2 }}>
              {pushStatus === 'granted'
                ? 'Recibirás avisos de nuevos conciertos cerca'
                : 'Activa para no perderte fechas cerca de ti'}
            </Text>
          </View>
        </View>

        {pushStatus !== 'granted' && pushStatus !== 'unsupported' && pushStatus !== 'loading' && (
          <View style={{ marginTop: spacing.md }}>
            <Button
              label={pushStatus === 'denied' ? 'Abrir ajustes' : 'Activar notificaciones'}
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
          MANTENIMIENTO
        </Text>

        <Button
          label="Sincronizar conciertos"
          onPress={handleSyncConcerts}
          loading={syncing}
          icon={<Ionicons name="sync" size={18} color="#fff" />}
        />

        <View style={{ height: spacing.sm }} />

        <Button
          label="Cerrar sesión"
          variant="ghost"
          onPress={handleLogout}
          icon={<Ionicons name="log-out-outline" size={18} color={colors.silver} />}
        />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text variant="monoSM" color="faint" style={{ textAlign: 'center' }}>
          METAL RADAR · MVP
        </Text>
      </View>
    </ScrollView>
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
});
