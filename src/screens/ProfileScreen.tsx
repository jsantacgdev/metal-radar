import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useProfileStats, StatsPeriod } from '../hooks/useProfileStats';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Button, Text } from '../components/ui';

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const { session } = useAuth();

  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('year');
  const currentYear = new Date().getFullYear();
  const { stats, loading: statsLoading } = useProfileStats(statsPeriod, currentYear);

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['profileStats'] });
      queryClient.invalidateQueries({ queryKey: ['spotify-user'] });
    }, [queryClient]),
  );

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

      {/* Estadísticas */}
      <View style={styles.section}>
        <View style={styles.statsHeader}>
          <Text variant="monoMD" color="muted" style={{ flex: 1 }}>
            {t('profile.statsLabel')}
          </Text>
          <View style={styles.periodToggle}>
            <TouchableOpacity
              style={[styles.periodTab, statsPeriod === 'year' && styles.periodTabActive]}
              onPress={() => setStatsPeriod('year')}
              activeOpacity={0.7}
            >
              <Text variant="monoSM" color={statsPeriod === 'year' ? 'bloodBright' : 'silver'}>
                {currentYear}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.periodTab, statsPeriod === 'all' && styles.periodTabActive]}
              onPress={() => setStatsPeriod('all')}
              activeOpacity={0.7}
            >
              <Text variant="monoSM" color={statsPeriod === 'all' ? 'bloodBright' : 'silver'}>
                {t('profile.statsAllTime')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {statsLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <Text variant="bodySM" color="muted">
              {t('common.loading')}
            </Text>
          </View>
        ) : stats.concerts === 0 && stats.festivals === 0 ? (
          <View style={styles.statsEmpty}>
            <Ionicons name="musical-notes-outline" size={32} color={colors.faint} />
            <Text
              variant="bodySM"
              color="muted"
              style={{ marginTop: spacing.sm, textAlign: 'center' }}
            >
              {t('profile.statsEmpty')}
            </Text>
          </View>
        ) : (
          <View style={styles.statsList}>
            <StatRow
              icon="musical-notes"
              value={stats.concerts.toString()}
              label={t('profile.statConcerts')}
            />
            <StatRow
              icon="flame"
              value={stats.festivals.toString()}
              label={t('profile.statFestivals')}
            />
            <StatRow icon="people" value={stats.bands.toString()} label={t('profile.statBands')} />
            <StatRow
              icon="location"
              value={stats.cities.toString()}
              label={t('profile.statCities')}
            />
            <StatRow
              icon="car"
              value={`${stats.km.toLocaleString(i18n.language)} km`}
              label={t('profile.statKm')}
            />
            {stats.topBand && (
              <StatRow
                icon="heart"
                value={`${stats.topBand.name} (${stats.topBand.count}x)`}
                label={t('profile.statTopBand')}
              />
            )}
            {stats.topGenre && (
              <StatRow icon="disc" value={stats.topGenre} label={t('profile.statTopGenre')} />
            )}
            {statsPeriod === 'all' && stats.bestYear && (
              <StatRow
                icon="trophy"
                value={`${stats.bestYear.year} (${stats.bestYear.count})`}
                label={t('profile.statBestYear')}
                isLast
              />
            )}
          </View>
        )}
      </View>

      {/* Acciones */}
      <View style={styles.actionsRow}>
        <View style={{ flex: 1 }}>
          <Button
            label={t('profile.settingsButton')}
            variant="secondary"
            onPress={() => navigation.navigate('Settings' as never)}
            icon={<Ionicons name="settings-outline" size={18} color={colors.bright} />}
          />
        </View>
        <View style={{ width: spacing.sm }} />
        <View style={{ flex: 1 }}>
          <Button
            label={t('auth.signOut')}
            variant="ghost"
            onPress={handleLogout}
            icon={<Ionicons name="log-out-outline" size={18} color={colors.silver} />}
          />
        </View>
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

function StatRow({
  icon,
  value,
  label,
  isLast,
}: {
  icon: any;
  value: string;
  label: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.statRow, isLast && { borderBottomWidth: 0 }]}>
      <View style={styles.statIconCircle}>
        <Ionicons name={icon} size={16} color={colors.bloodBright} />
      </View>
      <Text variant="body" color="muted" style={{ flex: 1, marginLeft: spacing.md }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.displayBold,
          fontSize: 16,
          color: colors.bright,
          letterSpacing: -0.3,
          maxWidth: '55%',
          textAlign: 'right',
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
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
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.full,
    padding: 2,
  },
  periodTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  periodTabActive: {
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
  },
  statsEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  statsList: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  statIconCircle: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  footer: {
    marginTop: spacing.xxxl,
  },
});
