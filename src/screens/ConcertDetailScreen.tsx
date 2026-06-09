import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useConcert } from '../hooks/useConcert';
import { MapStackParamList } from '../navigation/MapStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandImage from '../components/BandImage';

type Props = NativeStackScreenProps<MapStackParamList, 'ConcertDetail'>;

export default function ConcertDetailScreen({ route }: Props) {
  const { concertId } = route.params;
  const { concert, loading, error, updateStatus } = useConcert(concertId);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.bloodBright} size="large" />
      </View>
    );
  }

  if (error || !concert) {
    return (
      <View style={styles.centered}>
        <Text variant="body" color="bloodBright" style={{ textAlign: 'center' }}>
          {error ?? 'Concierto no encontrado'}
        </Text>
      </View>
    );
  }

  const dateObj = new Date(concert.event_date);
  const month = dateObj
    .toLocaleDateString('es-ES', { month: 'short' })
    .toUpperCase()
    .replace('.', '');
  const day = dateObj.getDate().toString();
  const weekday = dateObj.toLocaleDateString('es-ES', { weekday: 'long' }).toUpperCase();
  const fullDate = dateObj.toLocaleDateString('es-ES', {
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
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Hero con banda principal */}
        <View style={styles.hero}>
          <BandImage
            url={concert.bands[0]?.image_url ?? null}
            size={140}
            radiusOverride={radius.lg}
            showTag={!concert.bands[0]?.image_url}
          />
          <View style={styles.heroText}>
            <Text variant="monoMD" color="bloodBright">
              {isPast ? 'CONCIERTO PASADO' : 'PRÓXIMO CONCIERTO'}
            </Text>
            <Text variant="displayLG" style={{ marginTop: spacing.sm }} numberOfLines={2}>
              {concert.bands[0]?.name ?? 'Sin banda'}
            </Text>
            {concert.bands.length > 1 && (
              <Text variant="monoSM" color="silver" style={{ marginTop: 6 }} numberOfLines={1}>
                +{concert.bands.length - 1} BANDA{concert.bands.length > 2 ? 'S' : ''}
              </Text>
            )}
          </View>
        </View>

        {/* Meta strip: fecha, venue, distancia */}
        <View style={styles.metaStrip}>
          <View style={styles.dateBox}>
            <Text
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 10,
                letterSpacing: 1,
                color: colors.bloodBright,
              }}
            >
              {month}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.displayBold,
                fontSize: 26,
                lineHeight: 28,
                color: colors.bright,
              }}
            >
              {day}
            </Text>
          </View>
          <View style={styles.metaInfo}>
            <Text variant="displaySM" numberOfLines={1}>
              {concert.venue.name}
            </Text>
            <Text variant="monoSM" color="muted" style={{ marginTop: 4 }} numberOfLines={1}>
              {concert.venue.city ? `${concert.venue.city.toUpperCase()} · ` : ''}
              {timeStr}H
            </Text>
            <Text variant="monoSM" color="silver" style={{ marginTop: 4 }} numberOfLines={1}>
              {weekday} · {fullDate}
            </Text>
          </View>
        </View>

        {/* Precio */}
        {(concert.price_min ?? concert.price_max) != null && (
          <Section title="PRECIO">
            <Text variant="displaySM">
              {concert.price_min === concert.price_max
                ? `${concert.price_min} ${concert.currency}`
                : `${concert.price_min ?? '?'} – ${concert.price_max ?? '?'} ${concert.currency ?? ''}`}
            </Text>
          </Section>
        )}

        {/* Bandas del cartel */}
        {concert.bands.length > 0 && (
          <Section title="CARTEL">
            {concert.bands.map((b, i) => (
              <View
                key={b.id}
                style={[styles.bandRow, i === concert.bands.length - 1 && { borderBottomWidth: 0 }]}
              >
                <BandImage url={b.image_url} size={44} showTag={!b.image_url} />
                <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
                  <Text variant="displaySM" numberOfLines={1}>
                    {b.name}
                  </Text>
                </View>
              </View>
            ))}
          </Section>
        )}

        {/* Estado del usuario */}
        <Section title={isPast ? 'ASISTENCIA' : 'TU ESTADO'}>
          <View style={styles.actionsRow}>
            {!isPast && (
              <>
                <ActionPill
                  label="Me interesa"
                  active={concert.userStatus === 'interested'}
                  onPress={() =>
                    updateStatus(concert.userStatus === 'interested' ? null : 'interested')
                  }
                />
                <ActionPill
                  label="Voy"
                  active={concert.userStatus === 'going'}
                  highlight
                  onPress={() => updateStatus(concert.userStatus === 'going' ? null : 'going')}
                />
              </>
            )}
            <ActionPill
              label="Ya fui"
              active={concert.userStatus === 'attended'}
              highlight
              onPress={() => updateStatus(concert.userStatus === 'attended' ? null : 'attended')}
            />
          </View>
        </Section>

        {/* Banner de status del evento */}
        {concert.status !== 'onsale' && (
          <View style={styles.statusBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.bloodBright} />
            <Text variant="monoSM" color="bloodBright" style={{ marginLeft: 8 }}>
              ESTADO: {concert.status.toUpperCase()}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* CTA flotante de compra */}
      {!isPast && concert.ticket_url && (
        <View style={styles.ctaContainer}>
          <TouchableOpacity style={styles.ctaButton} onPress={openTickets} activeOpacity={0.85}>
            <Ionicons name="ticket-outline" size={20} color="#fff" />
            <Text
              style={{
                color: '#fff',
                fontFamily: fontFamily.bodyBold,
                fontSize: 15,
                letterSpacing: 0.3,
                marginLeft: spacing.sm,
              }}
            >
              Comprar entradas
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="monoMD" color="muted" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ActionPill({
  label,
  active,
  highlight,
  onPress,
}: {
  label: string;
  active: boolean;
  highlight?: boolean;
  onPress: () => void;
}) {
  const bg = active ? (highlight ? colors.blood : colors.silver) : 'transparent';
  const border = active ? (highlight ? colors.bloodBright : colors.silver) : colors.line;
  const textColor = active ? (highlight ? '#fff' : colors.ink) : colors.silver;

  return (
    <TouchableOpacity
      style={[styles.actionPill, { backgroundColor: bg, borderColor: border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={{
          fontFamily: fontFamily.mono,
          fontSize: 11,
          lineHeight: 13,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: textColor,
          includeFontPadding: false,
          textAlignVertical: 'center',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  metaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  dateBox: {
    width: 60,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaInfo: {
    flex: 1,
    minWidth: 0,
  },
  section: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  actionPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
  },
  ctaContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    backgroundColor: colors.ink,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.blood,
    borderWidth: 1,
    borderColor: colors.bloodBright,
    shadowColor: colors.blood,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
});
