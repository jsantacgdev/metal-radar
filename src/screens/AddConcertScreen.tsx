import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import BandLineupPicker from '../components/BandLineupPicker';
import { useSubmitConcert, SubmitConcertBand } from '../hooks/useSubmitConcert';
import { useEditConcert } from '../hooks/useEditConcert';
import { useConcert } from '../hooks/useConcert';
import { usePreference } from '../hooks/usePreference';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

type VenueResult = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
};

export default function AddConcertScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const concertId: string | undefined = route.params?.concertId;
  const isEditMode = !!concertId;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const submitConcert = useSubmitConcert();
  const editConcert = useEditConcert(concertId ?? '');
  const { concert: existingConcert, loading: existingLoading } = useConcert(concertId ?? '');

  const {
    value: infoSeen,
    setValue: setInfoSeen,
    loaded,
  } = usePreference<boolean>('addConcertInfoSeen', false);

  const [venueName, setVenueName] = useState('');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueLat, setVenueLat] = useState<number | null>(null);
  const [venueLng, setVenueLng] = useState<number | null>(null);
  const [venueResults, setVenueResults] = useState<VenueResult[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [bands, setBands] = useState<SubmitConcertBand[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const prefilled = useRef(false);

  useEffect(() => {
    if (!isEditMode || prefilled.current || !existingConcert) return;
    prefilled.current = true;

    setVenueName(existingConcert.venue.name);
    setVenueId(existingConcert.venue.id);
    setVenueLat(existingConcert.venue.lat);
    setVenueLng(existingConcert.venue.lng);
    setCity(existingConcert.venue.city ?? '');
    setCountry(existingConcert.venue.country ?? '');

    const [datePart, timePart] = existingConcert.event_date.split('T');
    setDate(datePart);
    const hhmm = timePart?.slice(0, 5);
    setTime(hhmm && hhmm !== '00:00' ? hhmm : '');

    setTicketUrl(existingConcert.ticket_url ?? '');

    setBands(
      existingConcert.bands.map((b) => ({
        name: b.name,
        matched_band_id: b.id,
        image_url: b.image_url,
        is_headliner: b.is_headliner,
        follow: false,
      })),
    );
  }, [isEditMode, existingConcert]);

  useEffect(() => {
    if (isEditMode || !loaded || infoSeen) return;
    Alert.alert(t('addConcert.infoDialogTitle'), t('addConcert.infoDialogBody'), [
      { text: t('addConcert.infoDialogAck'), onPress: () => setInfoSeen(true) },
    ]);
  }, [isEditMode, loaded, infoSeen]);

  useEffect(() => {
    if (venueId || venueName.trim().length < 2) {
      setVenueResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setVenueSearching(true);
        const { data, error } = await supabase
          .from('venues')
          .select('id, name, city, country, lat, lng')
          .ilike('name', `${venueName.trim()}%`)
          .limit(6);
        if (error) throw error;
        setVenueResults(data ?? []);
      } catch {
        setVenueResults([]);
      } finally {
        setVenueSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [venueName, venueId]);

  const handleVenueNameChange = (text: string) => {
    setVenueName(text);
    setVenueId(null);
    setVenueLat(null);
    setVenueLng(null);
  };

  const selectVenue = (venue: VenueResult) => {
    setVenueName(venue.name);
    setVenueId(venue.id);
    setVenueLat(venue.lat);
    setVenueLng(venue.lng);
    setCity(venue.city ?? '');
    setCountry(venue.country ?? '');
    setVenueResults([]);
  };

  const dateValid = DATE_RE.test(date.trim());
  const timeValid = time.trim().length === 0 || TIME_RE.test(time.trim());
  const canSubmit = venueName.trim().length > 0 && dateValid && timeValid && bands.length > 0;

  const venueNameError =
    submitAttempted && !venueName.trim() ? t('addConcert.missingVenueName') : null;
  const dateError = submitAttempted && !dateValid ? t('addConcert.invalidDate') : null;
  const timeError = submitAttempted && !timeValid ? t('addConcert.invalidTime') : null;
  const bandsError = submitAttempted && bands.length === 0 ? t('addConcert.missingBands') : null;

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (!canSubmit) return;

    const input = {
      event_date: date.trim(),
      event_time: time.trim() ? time.trim() : null,
      ticket_url: ticketUrl.trim() ? ticketUrl.trim() : null,
      venue: {
        id: venueId,
        name: venueName.trim(),
        city: city.trim() ? city.trim() : null,
        country: country.trim() ? country.trim() : null,
        lat: venueLat,
        lng: venueLng,
      },
      bands,
    };

    try {
      if (isEditMode) {
        await editConcert.mutateAsync(input);
        navigation.goBack();
      } else {
        const result = await submitConcert.mutateAsync(input);
        navigation.replace('ConcertDetail', { concertId: result.concert_id });
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const isSubmitting = isEditMode ? editConcert.isPending : submitConcert.isPending;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={10}
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditMode ? t('addConcert.editTitle') : t('addConcert.title')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {isEditMode && existingLoading && !existingConcert ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Field
            label={t('addConcert.venueNameLabel')}
            value={venueName}
            onChange={handleVenueNameChange}
            placeholder={t('addConcert.venueNamePlaceholder')}
            error={venueNameError}
          />
          {venueSearching && (
            <ActivityIndicator
              color={colors.bloodBright}
              size="small"
              style={styles.venueSpinner}
            />
          )}
          {venueResults.length > 0 && (
            <View style={styles.dropdown}>
              <FlatList
                data={venueResults}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.resultRow} onPress={() => selectVenue(item)}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="body" numberOfLines={1}>
                        {item.name}
                      </Text>
                      {(item.city || item.country) && (
                        <Text variant="monoSM" color="muted" numberOfLines={1}>
                          {[item.city, item.country].filter(Boolean).join(', ')}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="add-circle-outline" size={18} color={colors.bloodBright} />
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
        <Field label={t('addConcert.cityLabel')} value={city} onChange={setCity} />
        <Field label={t('addConcert.countryLabel')} value={country} onChange={setCountry} />
        <Field
          label={t('addConcert.dateLabel')}
          value={date}
          onChange={setDate}
          placeholder="YYYY-MM-DD"
          error={dateError}
        />
        <Field
          label={t('addConcert.timeLabel')}
          value={time}
          onChange={setTime}
          placeholder={t('addConcert.timePlaceholder')}
          error={timeError}
        />
        <Field
          label={t('addConcert.ticketUrlLabel')}
          value={ticketUrl}
          onChange={setTicketUrl}
          placeholder="https://"
        />

        <Text variant="monoSM" color="muted" style={styles.sectionLabel}>
          {t('addConcert.bandsLabel')}
        </Text>
        <BandLineupPicker bands={bands} onChange={setBands} showFollowToggle={!isEditMode} />
        {bandsError && (
          <Text variant="bodySM" color="bloodBright" style={styles.fieldError}>
            {bandsError}
          </Text>
        )}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>
                {isEditMode ? t('addConcert.saveChangesButton') : t('addConcert.submitButton')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
      )}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
}) {
  return (
    <View>
      <View style={[styles.fieldRow, error && styles.fieldRowError]}>
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
      {error && (
        <Text variant="bodySM" color="bloodBright" style={styles.fieldError}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  fieldRowError: {
    borderBottomColor: colors.bloodBright,
  },
  fieldError: {
    paddingTop: 4,
    paddingBottom: 6,
  },
  fieldLabel: { width: 90 },
  input: {
    flex: 1,
    color: colors.bright,
    fontFamily: fontFamily.body,
    fontSize: 14,
    paddingVertical: 0,
  },
  sectionLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  venueSpinner: {
    position: 'absolute',
    right: 0,
    top: 12,
  },
  dropdown: {
    marginTop: -1,
    marginBottom: spacing.xs,
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
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blood,
    borderWidth: 1,
    borderColor: colors.bloodBright,
    borderRadius: radius.lg,
    paddingVertical: 16,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: fontFamily.displayBold,
    fontSize: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
