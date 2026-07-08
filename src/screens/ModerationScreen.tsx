import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useReportedConcerts, ReportedConcert } from '../hooks/useReportedConcerts';
import { useModerateConcert } from '../hooks/useModerateConcert';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import EmptyState from '../components/EmptyState';
import { localeFromI18n } from '../i18n';

export default function ModerationScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = localeFromI18n(i18n.language);

  const { concerts, loading, error, reload } = useReportedConcerts();
  const moderate = useModerateConcert();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleDismiss = (concert: ReportedConcert) => {
    setBusyId(concert.id);
    moderate.mutate(
      { concertId: concert.id, action: 'dismiss' },
      {
        onSuccess: () => Alert.alert(t('moderation.dismissSuccess')),
        onError: (err: any) => Alert.alert(t('common.error'), err.message),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const handleDelete = (concert: ReportedConcert) => {
    Alert.alert(t('moderation.deleteConfirmTitle'), t('moderation.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.deleteButton'),
        style: 'destructive',
        onPress: () => {
          setBusyId(concert.id);
          moderate.mutate(
            { concertId: concert.id, action: 'delete' },
            {
              onSuccess: () => Alert.alert(t('moderation.deleteSuccess')),
              onError: (err: any) => Alert.alert(t('common.error'), err.message),
              onSettled: () => setBusyId(null),
            },
          );
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('moderation.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text variant="bodySM" color="bloodBright" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
            {error}
          </Text>
        </View>
      ) : concerts.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title={t('moderation.emptyTitle')}
          description={t('moderation.emptyDesc')}
        />
      ) : (
        <FlatList
          data={concerts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshing={loading}
          onRefresh={reload}
          renderItem={({ item }) => {
            const headliner = item.bands.find((b) => b.is_headliner) ?? item.bands[0];
            const dateStr = new Date(item.event_date).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            const isBusy = busyId === item.id && moderate.isPending;

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="displaySM" numberOfLines={1}>
                      {headliner?.name ?? t('concertDetail.noBand')}
                    </Text>
                    <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                      {item.venue.name}
                      {item.venue.city ? ` · ${item.venue.city}` : ''} · {dateStr}
                    </Text>
                  </View>
                  <View style={styles.reportBadge}>
                    <Ionicons name="flag" size={12} color={colors.bloodBright} />
                    <Text variant="monoSM" color="bloodBright" style={{ marginLeft: 4 }}>
                      {t('moderation.reportsLabel', { count: item.report_count })}
                    </Text>
                  </View>
                </View>

                {item.reports.length > 0 && (
                  <View style={styles.reasonsBox}>
                    {item.reports.map((r, i) => (
                      <Text key={i} variant="bodySM" color="muted" style={{ marginTop: i > 0 ? 4 : 0 }}>
                        {r.reason ? `"${r.reason}"` : t('moderation.noReason')}
                      </Text>
                    ))}
                  </View>
                )}

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.dismissBtn]}
                    onPress={() => navigation.navigate('AddConcert', { concertId: item.id })}
                    disabled={isBusy}
                    activeOpacity={0.8}
                  >
                    <Text variant="monoSM" color="silver">
                      {t('moderation.editButton')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.dismissBtn]}
                    onPress={() => handleDismiss(item)}
                    disabled={isBusy}
                    activeOpacity={0.8}
                  >
                    {isBusy ? (
                      <ActivityIndicator color={colors.silver} size="small" />
                    ) : (
                      <Text variant="monoSM" color="silver">
                        {t('moderation.dismissButton')}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => handleDelete(item)}
                    disabled={isBusy}
                    activeOpacity={0.8}
                  >
                    <Text variant="monoSM" color="bloodBright">
                      {t('moderation.deleteButton')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  reportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    marginLeft: spacing.sm,
  },
  reasonsBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  dismissBtn: {
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  deleteBtn: {
    borderColor: colors.bloodTintBorder,
    backgroundColor: colors.bloodTint,
  },
});
