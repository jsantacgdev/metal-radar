import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useBandInfo, BandMember } from '../hooks/useBandInfo';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text, Tag } from '../components/ui';
import BandImage from '../components/BandImage';
import { RadarStackParamList } from '../navigation/RadarStack';

type Props = NativeStackScreenProps<RadarStackParamList, 'BandDetail'>;

async function fetchBandBasics(bandId: string) {
  const { data, error } = await supabase
    .from('bands')
    .select('id, name, image_url, genres')
    .eq('id', bandId)
    .single();
  if (error) throw error;
  return data;
}

export default function BandDetailScreen({ route }: Props) {
  const { bandId } = route.params;

  const { data: basics } = useQuery({
    queryKey: ['bandBasics', bandId],
    queryFn: () => fetchBandBasics(bandId),
  });

  const { info, loading, error } = useBandInfo(bandId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      {/* Hero */}
      <View style={styles.hero}>
        <BandImage
          url={basics?.image_url ?? null}
          size={180}
          radiusOverride={radius.lg}
          showTag={!basics?.image_url}
        />
        <View style={styles.heroText}>
          <Text variant="monoMD" color="bloodBright">
            FICHA DE BANDA
          </Text>
          <Text variant="displayLG" style={{ marginTop: spacing.sm }}>
            {basics?.name ?? '...'}
          </Text>
          {info?.country && (
            <View style={styles.countryRow}>
              <Ionicons name="location-outline" size={14} color={colors.silver} />
              <Text variant="monoMD" color="silver" style={{ marginLeft: 6 }}>
                {info.country.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>

      {loading && !info && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} />
          <Text variant="monoSM" color="muted" style={{ marginTop: spacing.md }}>
            CARGANDO INFO...
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text variant="bodySM" color="bloodBright">
            {error}
          </Text>
        </View>
      )}

      {info && (
        <>
          {/* Meta strip */}
          <View style={styles.metaStrip}>
            {info.formed_year && (
              <MetaItem label="DESDE" value={info.formed_year.toString()} accent />
            )}
            {info.members && info.members.length > 0 && (
              <MetaItem
                label="MIEMBROS"
                value={info.members.filter((m) => m.current).length.toString()}
              />
            )}
            {info.genres && info.genres.length > 0 && (
              <MetaItem label="GÉNERO" value={info.genres[0]} />
            )}
          </View>

          {/* Bio */}
          {info.bio && (
            <Section title="BIOGRAFÍA">
              <Text variant="body" color="silver" style={{ lineHeight: 22 }}>
                {info.bio}
              </Text>
            </Section>
          )}

          {/* Géneros */}
          {info.genres && info.genres.length > 0 && (
            <Section title="ESTILO">
              <View style={styles.tagsRow}>
                {info.genres.map((g, i) => (
                  <Tag key={i} tone={i === 0 ? 'blood' : 'steel'}>
                    {g}
                  </Tag>
                ))}
              </View>
            </Section>
          )}

          {/* Miembros */}
          {info.members && info.members.length > 0 && (
            <Section title="FORMACIÓN">
              {info.members.map((m: BandMember, i: number) => (
                <View key={i} style={styles.memberRow}>
                  <View style={styles.memberDot}>
                    <View
                      style={[
                        styles.memberDotInner,
                        m.current && { backgroundColor: colors.bloodBright },
                      ]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="displaySM">{m.name}</Text>
                    {(m.begin || m.end) && (
                      <Text variant="monoSM" color="muted" style={{ marginTop: 4 }}>
                        {m.begin
                          ? `${m.begin.substring(0, 4)} — ${m.end ? m.end.substring(0, 4) : 'PRESENTE'}`
                          : ''}
                      </Text>
                    )}
                  </View>
                  {m.current && (
                    <Text variant="monoSM" color="bloodBright">
                      ACTUAL
                    </Text>
                  )}
                </View>
              ))}
            </Section>
          )}
        </>
      )}
    </ScrollView>
  );
}

function MetaItem({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.metaItem}>
      <Text
        style={{
          fontFamily: fontFamily.displayBold,
          fontSize: 22,
          letterSpacing: -0.4,
          color: accent ? colors.bloodBright : colors.bright,
          textTransform: 'uppercase',
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text variant="monoSM" color="muted" style={{ marginTop: 4 }} numberOfLines={1}>
        {label}
      </Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
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
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  errorBox: {
    margin: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
  },
  metaStrip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: spacing.lg,
  },
  metaItem: {
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
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  memberDot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  memberDotInner: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.faint,
  },
});
