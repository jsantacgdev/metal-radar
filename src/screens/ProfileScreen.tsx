import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { usePreference } from '../hooks/usePreference';
import { syncAllConcerts } from '../lib/sync';

export default function ProfileScreen() {
  const { session } = useAuth();

  const { profile, update } = useProfile();

  const [radius, setRadius] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  const displayRadius = radius ?? profile?.search_radius_km ?? 200;

  const { value: skipConfirm, setValue: setSkipConfirm } = usePreference<boolean>(
    'skipUnfollowConfirm',
    false,
  );

  const handleSyncConcerts = async () => {
    try {
      setSyncing(true);
      const result = await syncAllConcerts();
      Alert.alert(
        'Sincronización completada',
        `Conciertos: ${result.synced}\nDescartados: ${result.discarded}\nBandas saltadas: ${result.bands_skipped}`,
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
      await update({
        search_radius_km: rounded,
      });
    } catch (err: any) {
      Alert.alert('Error al guardar radio', err.message);
    }
  };

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: '#0a0a0a',
      }}
    >
      {/* Cabecera */}
      <View style={styles.section}>
        <Text style={styles.email}>{session?.user.email}</Text>
      </View>

      {/* Radio de búsqueda (push) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Radio para notificaciones</Text>
        <Text style={styles.sectionDescription}>
          Distancia máxima desde tu ubicación de referencia para avisarte de nuevos conciertos.
        </Text>
        <Text style={styles.radiusValue}>{displayRadius} km</Text>
        <Slider
          style={{
            width: '100%',
            height: 40,
          }}
          minimumValue={50}
          maximumValue={500}
          step={10}
          value={profile?.search_radius_km ?? 200}
          minimumTrackTintColor="#dc2626"
          maximumTrackTintColor="#333"
          thumbTintColor="#dc2626"
          onValueChange={setRadius}
          onSlidingComplete={handleRadiusComplete}
        />
      </View>

      {/* Ubicación de referencia */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ubicación de referencia</Text>
        <Text style={styles.sectionDescription}>
          Solo para notificaciones. El mapa usa siempre tu ubicación actual.
        </Text>
        {profile?.home_lat && profile?.home_lng ? (
          <Text style={styles.locationText}>
            {profile.home_lat.toFixed(3)}, {profile.home_lng.toFixed(3)}
          </Text>
        ) : (
          <Text style={styles.locationText}>Sin establecer</Text>
        )}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleSetHomeLocation}
          disabled={savingLocation}
        >
          {savingLocation ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.secondaryButtonText}>Usar mi ubicación actual</Text>
          )}
        </TouchableOpacity>
      </View>

      {skipConfirm && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Confirmaciones</Text>
          <Text style={styles.sectionDescription}>
            Has desactivado la confirmación al dejar de seguir bandas.
          </Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setSkipConfirm(false)}>
            <Text style={styles.secondaryButtonText}>Volver a preguntar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Acciones */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleSyncConcerts}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionButtonText}>Sincronizar conciertos</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.logoutButton]}
          onPress={() => supabase.auth.signOut()}
        >
          <Text style={styles.actionButtonText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  sectionDescription: {
    color: '#777',
    fontSize: 13,
    marginBottom: 12,
  },
  email: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  radiusValue: {
    color: '#dc2626',
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  locationText: {
    color: '#bbb',
    fontSize: 14,
    marginBottom: 12,
  },

  actionButton: {
    backgroundColor: '#dc2626',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#333',
  },
  secondaryButton: {
    backgroundColor: '#222',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
