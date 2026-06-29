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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../navigation/ProfileStack';
import { useRef } from 'react';

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { session } = useAuth();

  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('year');
  const currentYear = new Date().getFullYear();
  const { stats, loading: statsLoading } = useProfileStats(statsPeriod, currentYear);
  const tapCountRef = useRef(0);
  const tapResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSecretTap = () => {
    tapCountRef.current += 1;
    if (tapResetTimeoutRef.current) clearTimeout(tapResetTimeoutRef.current);
    tapResetTimeoutRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);

    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      navigation.navigate('PosterAdmin');
    }
  };
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
          <Text
            variant="displaySM"
            numberOfLines={1}
            style={{ marginTop: 4, lineHeight: 28, paddingBottom: 2 }}
          >
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
              onPress={() =>
                navigation.navigate('StatsDetail', {
                  kind: 'concerts',
                  period: statsPeriod,
                  year: currentYear,
                })
              }
            />
            <StatRow
              icon="flame"
              value={stats.festivals.toString()}
              label={t('profile.statFestivals')}
              onPress={() =>
                navigation.navigate('StatsDetail', {
                  kind: 'festivals',
                  period: statsPeriod,
                  year: currentYear,
                })
              }
            />
            <StatRow
              icon="people"
              value={stats.bands.toString()}
              label={t('profile.statBands')}
              onPress={() =>
                navigation.navigate('StatsDetail', {
                  kind: 'bands',
                  period: statsPeriod,
                  year: currentYear,
                })
              }
            />
            <StatRow
              icon="location"
              value={stats.cities.toString()}
              label={t('profile.statCities')}
              onPress={() =>
                navigation.navigate('StatsDetail', {
                  kind: 'cities',
                  period: statsPeriod,
                  year: currentYear,
                })
              }
            />
            <StatRow
              icon="car"
              value={`${stats.km.toLocaleString(i18n.language)} km`}
              label={t('profile.statKm')}
              onPress={() =>
                navigation.navigate('StatsDetail', {
                  kind: 'km',
                  period: statsPeriod,
                  year: currentYear,
                })
              }
            />
            {stats.topBand && (
              <StatRow
                icon="heart"
                value={`${stats.topBand.name} (${stats.topBand.count}x)`}
                label={t('profile.statTopBand')}
                onPress={() =>
                  navigation.navigate('StatsDetail', {
                    kind: 'topBand',
                    period: statsPeriod,
                    year: currentYear,
                  })
                }
              />
            )}
            {stats.topGenre && (
              <StatRow
                icon="disc"
                value={stats.topGenre}
                label={t('profile.statTopGenre')}
                onPress={() =>
                  navigation.navigate('StatsDetail', {
                    kind: 'topGenre',
                    period: statsPeriod,
                    year: currentYear,
                  })
                }
              />
            )}
            {statsPeriod === 'all' && stats.bestYear && (
              <StatRow
                icon="trophy"
                value={`${stats.bestYear.year} (${stats.bestYear.count})`}
                label={t('profile.statBestYear')}
                isLast
                onPress={() =>
                  navigation.navigate('StatsDetail', {
                    kind: 'bestYear',
                    period: statsPeriod,
                    year: currentYear,
                  })
                }
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
      <TouchableOpacity activeOpacity={1} onPress={handleSecretTap}>
        <Text variant="monoSM" color="muted">
          {t('profile.footerTagline')}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatRow({
  icon,
  value,
  label,
  isLast,
  onPress,
}: {
  icon: any;
  value: string;
  label: string;
  isLast?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
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
      {onPress && (
        <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 8 }} />
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.statRow, isLast && { borderBottomWidth: 0 }]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.statRow, isLast && { borderBottomWidth: 0 }]}>{content}</View>;
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
