import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useConcert } from '../hooks/useConcert';
import { MapStackParamList } from '../navigation/MapStack';

type Props = NativeStackScreenProps<MapStackParamList, 'ConcertDetail'>;

export default function ConcertDetailScreen({ route }: Props) {
  const { concertId } = route.params;
  const { concert, loading, error, updateStatus } = useConcert(concertId);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#dc2626" size="large" />
      </View>
    );
  }

  if (error || !concert) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Concierto no encontrado'}</Text>
      </View>
    );
  }

  const dateObj = new Date(concert.event_date);
  const dateStr = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const isPast = dateObj.getTime() < Date.now();

  const openTickets = () => {
    if (concert.ticket_url) Linking.openURL(concert.ticket_url);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      {/* Banda(s) */}
      <View style={styles.section}>
        {concert.bands.map((b) => (
          <View key={b.id} style={styles.bandRow}>
            {b.image_url ? (
              <Image source={{ uri: b.image_url }} style={styles.bandImage} />
            ) : (
              <View style={[styles.bandImage, { backgroundColor: '#333' }]} />
            )}
            <Text style={styles.bandName}>{b.name}</Text>
          </View>
        ))}
      </View>

      {/* Datos del evento */}
      <View style={styles.section}>
        <Text style={styles.label}>Fecha</Text>
        <Text style={styles.value}>{dateStr}</Text>
        <Text style={styles.subValue}>{timeStr}h</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Recinto</Text>
        <Text style={styles.value}>{concert.venue.name}</Text>
        <Text style={styles.subValue}>
          {concert.venue.city}
          {concert.venue.country ? ` · ${concert.venue.country}` : ''}
        </Text>
      </View>

      {(concert.price_min ?? concert.price_max) && (
        <View style={styles.section}>
          <Text style={styles.label}>Precio</Text>
          <Text style={styles.value}>
            {concert.price_min === concert.price_max
              ? `${concert.price_min} ${concert.currency}`
              : `${concert.price_min ?? '?'} - ${concert.price_max ?? '?'} ${concert.currency ?? ''}`}
          </Text>
        </View>
      )}

      {concert.status !== 'onsale' && (
        <View style={styles.statusBanner}>
          <Text style={styles.statusBannerText}>Estado: {concert.status.toUpperCase()}</Text>
        </View>
      )}

      {/* Acciones */}
      <View style={styles.section}>
        <Text style={styles.label}>Tu estado</Text>
        <View style={styles.actionRow}>
          {!isPast && (
            <>
              <ActionButton
                label="Me interesa"
                active={concert.userStatus === 'interested'}
                onPress={() =>
                  updateStatus(concert.userStatus === 'interested' ? null : 'interested')
                }
              />
              <ActionButton
                label="Voy"
                active={concert.userStatus === 'going'}
                onPress={() => updateStatus(concert.userStatus === 'going' ? null : 'going')}
              />
            </>
          )}
          <ActionButton
            label="Ya fui"
            active={concert.userStatus === 'attended'}
            onPress={() => updateStatus(concert.userStatus === 'attended' ? null : 'attended')}
          />
        </View>
      </View>

      {concert.ticket_url && !isPast && (
        <TouchableOpacity style={styles.ticketButton} onPress={openTickets}>
          <Text style={styles.ticketButtonText}>Comprar entradas</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ActionButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, active && styles.actionBtnActive]}
      onPress={onPress}
    >
      <Text style={[styles.actionBtnText, active && styles.actionBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  errorText: { color: '#dc2626', padding: 20, textAlign: 'center' },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  label: { color: '#777', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 },
  value: { color: '#fff', fontSize: 18, fontWeight: '600' },
  subValue: { color: '#bbb', fontSize: 14, marginTop: 4 },
  bandRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  bandImage: { width: 60, height: 60, borderRadius: 30, marginRight: 14 },
  bandName: { color: '#fff', fontSize: 20, fontWeight: 'bold', flex: 1 },
  statusBanner: {
    backgroundColor: '#7a1f1f',
    padding: 12,
    marginHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  statusBannerText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  actionBtnActive: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  actionBtnText: { color: '#bbb', fontWeight: '600' },
  actionBtnTextActive: { color: '#fff' },
  ticketButton: {
    backgroundColor: '#dc2626',
    padding: 16,
    borderRadius: 8,
    margin: 20,
    alignItems: 'center',
  },
  ticketButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
