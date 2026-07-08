import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';

type Stage = 'select' | 'processing' | 'review' | 'committing' | 'done';

type ParsedBand = {
  extracted_name: string;
  matched_band_id: string | null;
  matched_band_name: string | null;
  tier: 'headliner' | 'subheadliner' | 'lineup';
};

type ParsedFestival = {
  name: string | null;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  existing_festival_id: string | null;
  existing_venue_id: string | null;
};

type CommitResult = {
  festival_id: string;
  venue_id: string;
  created_festival: boolean;
  created_venue: boolean;
  venue_geocoded: boolean;
  venue_geocode_strategy: 'venue' | 'city' | null;
  bands_added: number;
  bands_created: number;
  bands_reused: number;
  bands_skipped: number;
  image_url: string | null;
  image_upload_error: string | null;
};

export default function PosterAdminScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>('select');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [festival, setFestival] = useState<ParsedFestival | null>(null);
  const [bands, setBands] = useState<ParsedBand[]>([]);
  const [result, setResult] = useState<CommitResult | null>(null);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la galería');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });
    if (res.canceled) return;
    const asset = res.assets[0];

    const manip = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1600 } }], {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });

    setImageUri(manip.uri);
    setImageBase64(manip.base64 ?? null);
  };

  const processImage = async () => {
    if (!imageBase64) return;
    setStage('processing');

    try {
      const { data, error } = await supabase.functions.invoke('parse-festival-poster', {
        body: { imageBase64, mediaType: 'image/jpeg' },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setFestival(data.festival);
      setBands(data.bands ?? []);
      setStage('review');
    } catch (err: any) {
      Alert.alert('Error procesando cartel', err.message);
      setStage('select');
    }
  };

  const removeBand = (index: number) => {
    setBands(bands.filter((_, i) => i !== index));
  };

  const cycleTier = (index: number) => {
    const cycle: Array<ParsedBand['tier']> = ['headliner', 'subheadliner', 'lineup'];
    const current = bands[index].tier;
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    setBands(bands.map((b, i) => (i === index ? { ...b, tier: next } : b)));
  };

  const updateFestival = (field: keyof ParsedFestival, value: string) => {
    if (!festival) return;
    setFestival({ ...festival, [field]: value.trim() || null } as ParsedFestival);
  };

  const commit = async () => {
    if (!festival?.name) {
      Alert.alert('Falta nombre', 'El festival necesita un nombre');
      return;
    }
    setStage('committing');

    try {
      const payload = {
        festival: {
          id: festival.existing_festival_id,
          name: festival.name,
          start_date: festival.start_date,
          end_date: festival.end_date,
          venue: {
            id: festival.existing_venue_id,
            name: festival.venue_name,
            city: festival.city,
            country: festival.country,
            lat: null,
            lng: null,
          },
        },
        bands: bands.map((b) => ({
          name: b.extracted_name,
          matched_band_id: b.matched_band_id,
          tier: b.tier,
        })),
        imageBase64,
        mediaType: 'image/jpeg',
      };

      const { data, error } = await supabase.functions.invoke('commit-festival-from-poster', {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data);
      setStage('done');
    } catch (err: any) {
      Alert.alert('Error guardando', err.message);
      setStage('review');
    }
  };

  const reset = () => {
    setStage('select');
    setImageUri(null);
    setImageBase64(null);
    setFestival(null);
    setBands([]);
    setResult(null);
  };

  const matched = bands.filter((b) => b.matched_band_id !== null);
  const toCreate = bands.filter((b) => b.matched_band_id === null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>OCR Carteles</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: spacing.xxxl + insets.bottom,
        }}
      >
        {stage === 'select' && (
          <SelectStage imageUri={imageUri} onPick={pickImage} onProcess={processImage} />
        )}

        {stage === 'processing' && (
          <Centered>
            <ActivityIndicator color={colors.bloodBright} size="large" />
            <Text variant="body" color="muted" style={styles.processingHint}>
              Procesando con IA...{'\n'}Esto puede tardar 10-30 segundos.
            </Text>
          </Centered>
        )}

        {stage === 'review' && festival && (
          <>
            <SectionLabel text="FESTIVAL DETECTADO" />
            <View style={styles.card}>
              <Field
                label="Nombre"
                value={festival.name ?? ''}
                onChange={(v) => updateFestival('name', v)}
              />
              <Field
                label="Inicio"
                value={festival.start_date ?? ''}
                onChange={(v) => updateFestival('start_date', v)}
                placeholder="YYYY-MM-DD"
              />
              <Field
                label="Fin"
                value={festival.end_date ?? ''}
                onChange={(v) => updateFestival('end_date', v)}
                placeholder="YYYY-MM-DD"
              />
              <Field
                label="Recinto"
                value={festival.venue_name ?? ''}
                onChange={(v) => updateFestival('venue_name', v)}
              />
              <Field
                label="Ciudad"
                value={festival.city ?? ''}
                onChange={(v) => updateFestival('city', v)}
              />
              <Field
                label="País"
                value={festival.country ?? ''}
                onChange={(v) => updateFestival('country', v)}
                placeholder="ES"
              />

              <View style={styles.badgeRow}>
                {festival.existing_festival_id ? (
                  <Badge text="EXISTENTE · SE ACTUALIZARÁ" tint="blood" />
                ) : (
                  <Badge text="NUEVO · SE CREARÁ" tint="green" />
                )}
                {festival.existing_venue_id ? (
                  <Badge text="VENUE EXISTENTE" tint="muted" />
                ) : festival.venue_name ? (
                  <Badge text="VENUE NUEVO · SE GEOCODIFICARÁ" tint="green" />
                ) : (
                  <Badge text="SIN VENUE" tint="muted" />
                )}
                <Badge text="CARTEL SE GUARDARÁ" tint="muted" />
              </View>
            </View>

            <SectionLabel text={`BANDAS · ${bands.length}`} top />

            {matched.length > 0 && (
              <Text variant="monoSM" color="silver" style={styles.subsection}>
                ENCONTRADAS · {matched.length}
              </Text>
            )}
            {bands.map(
              (b, i) =>
                b.matched_band_id !== null && (
                  <BandRow
                    key={`m-${i}`}
                    band={b}
                    onRemove={() => removeBand(i)}
                    onTier={() => cycleTier(i)}
                  />
                ),
            )}

            {toCreate.length > 0 && (
              <Text variant="monoSM" color="silver" style={styles.subsection}>
                SE CREARÁN · {toCreate.length}
              </Text>
            )}
            {bands.map(
              (b, i) =>
                b.matched_band_id === null && (
                  <BandRow
                    key={`c-${i}`}
                    band={b}
                    onRemove={() => removeBand(i)}
                    onTier={() => cycleTier(i)}
                  />
                ),
            )}

            <TouchableOpacity style={styles.primaryButton} onPress={commit}>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>
                {festival.existing_festival_id ? 'ACTUALIZAR FESTIVAL' : 'CREAR FESTIVAL'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
              <Text variant="bodySM" color="muted">
                Cancelar y empezar de nuevo
              </Text>
            </TouchableOpacity>
          </>
        )}

        {stage === 'committing' && (
          <Centered>
            <ActivityIndicator color={colors.bloodBright} size="large" />
            <Text variant="body" color="muted" style={styles.processingHint}>
              Guardando en base de datos...{'\n'}Subiendo cartel y geocodificando.
            </Text>
          </Centered>
        )}

        {stage === 'done' && result && (
          <Centered>
            <Ionicons name="checkmark-circle" size={64} color="#21c577" />
            <Text variant="displaySM" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
              ¡Festival guardado!
            </Text>
            <View style={[styles.card, { marginTop: spacing.lg, width: '100%' }]}>
              <ResultRow
                label="Festival"
                value={result.created_festival ? 'Creado' : 'Actualizado'}
              />
              <ResultRow
                label="Venue"
                value={
                  result.created_venue
                    ? result.venue_geocoded
                      ? `Creado (geo: ${result.venue_geocode_strategy === 'venue' ? 'recinto' : 'ciudad'})`
                      : 'Creado (sin geo)'
                    : 'Reutilizado'
                }
              />
              <ResultRow
                label="Cartel"
                value={
                  result.image_url
                    ? 'Subido'
                    : result.image_upload_error
                      ? `Error: ${result.image_upload_error.slice(0, 30)}`
                      : 'No subido'
                }
              />
              <ResultRow label="Bandas añadidas" value={result.bands_added.toString()} />
              {result.bands_created > 0 && (
                <ResultRow label="Bandas creadas" value={result.bands_created.toString()} />
              )}
              {result.bands_reused > 0 && (
                <ResultRow label="Bandas reutilizadas" value={result.bands_reused.toString()} />
              )}
              {result.bands_skipped > 0 && (
                <ResultRow label="Saltadas (error)" value={result.bands_skipped.toString()} />
              )}
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={reset}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>PROCESAR OTRO CARTEL</Text>
            </TouchableOpacity>
          </Centered>
        )}
      </ScrollView>
    </View>
  );
}

function SelectStage({
  imageUri,
  onPick,
  onProcess,
}: {
  imageUri: string | null;
  onPick: () => void;
  onProcess: () => void;
}) {
  return (
    <>
      {imageUri ? (
        <View style={styles.imagePreviewWrap}>
          <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="contain" />
        </View>
      ) : (
        <TouchableOpacity style={styles.imagePicker} onPress={onPick} activeOpacity={0.7}>
          <Ionicons name="image-outline" size={48} color={colors.muted} />
          <Text variant="body" color="muted" style={{ marginTop: spacing.md, textAlign: 'center' }}>
            Toca para seleccionar imagen del cartel
          </Text>
          <Text
            variant="bodySM"
            color="faint"
            style={{ marginTop: spacing.xs, textAlign: 'center' }}
          >
            JPEG, PNG o WebP
          </Text>
        </TouchableOpacity>
      )}

      {imageUri && (
        <>
          <TouchableOpacity style={styles.secondaryButton} onPress={onPick}>
            <Text variant="bodySM" color="silver">
              Cambiar imagen
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={onProcess}>
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>PROCESAR CARTEL</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

function SectionLabel({ text, top }: { text: string; top?: boolean }) {
  return (
    <Text
      variant="monoMD"
      color="bloodBright"
      style={{ marginTop: top ? spacing.xl : 0, marginBottom: spacing.md }}
    >
      {text}
    </Text>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text variant="monoSM" color="muted" style={styles.fieldLabel}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? '—'}
        placeholderTextColor={colors.faint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function Badge({ text, tint }: { text: string; tint: 'green' | 'blood' | 'muted' }) {
  const bg =
    tint === 'green'
      ? 'rgba(33,197,119,0.15)'
      : tint === 'blood'
        ? colors.bloodTint
        : colors.panel2;
  const color = tint === 'green' ? '#21c577' : tint === 'blood' ? colors.bloodBright : colors.muted;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="monoSM" style={{ color }}>
        {text}
      </Text>
    </View>
  );
}

function BandRow({
  band,
  onRemove,
  onTier,
}: {
  band: ParsedBand;
  onRemove: () => void;
  onTier: () => void;
}) {
  const isMatched = band.matched_band_id !== null;
  const tierColor =
    band.tier === 'headliner'
      ? colors.bloodBright
      : band.tier === 'subheadliner'
        ? '#f0ad4e'
        : colors.muted;
  const tierLabel =
    band.tier === 'headliner' ? 'HEAD' : band.tier === 'subheadliner' ? 'SUB' : 'LINEUP';

  return (
    <View style={styles.bandRow}>
      <View style={[styles.bandStatus, { backgroundColor: isMatched ? '#21c577' : '#5694ff' }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" numberOfLines={1}>
          {band.extracted_name}
        </Text>
        {isMatched && band.matched_band_name !== band.extracted_name && (
          <Text variant="monoSM" color="muted" numberOfLines={1}>
            → {band.matched_band_name}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onTier}
        style={[styles.tierTag, { borderColor: tierColor }]}
        hitSlop={6}
      >
        <Text variant="monoSM" style={{ color: tierColor }}>
          {tierLabel}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} style={styles.removeBtn} hitSlop={10}>
        <Ionicons name="close" size={18} color={colors.faint} />
      </TouchableOpacity>
    </View>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text variant="monoSM" color="muted" style={styles.fieldLabel}>
        {label.toUpperCase()}
      </Text>
      <Text variant="body" style={{ flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.bright,
    fontFamily: fontFamily.displayBold,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  centered: { alignItems: 'center', paddingTop: spacing.xxxl },
  processingHint: { marginTop: spacing.lg, textAlign: 'center' },
  imagePicker: {
    height: 280,
    borderWidth: 2,
    borderColor: colors.line,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.panel,
    padding: spacing.lg,
  },
  imagePreviewWrap: {
    width: '100%',
    height: 400,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.panel,
  },
  imagePreview: { width: '100%', height: '100%' },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blood,
    borderWidth: 1,
    borderColor: colors.bloodBright,
    borderRadius: radius.lg,
    paddingVertical: 16,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: fontFamily.displayBold,
    fontSize: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  secondaryButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  fieldLabel: { width: 90 },
  input: {
    flex: 1,
    color: colors.bright,
    fontFamily: fontFamily.body,
    fontSize: 14,
    paddingVertical: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  subsection: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
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
  bandStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
