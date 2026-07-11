import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useReportedConcerts, ReportedConcert } from '../hooks/useReportedConcerts';
import { useModerateConcert } from '../hooks/useModerateConcert';
import { useReportedComments, ReportedComment } from '../hooks/useReportedComments';
import { useModerateComment } from '../hooks/useModerateComment';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import EmptyState from '../components/EmptyState';
import { localeFromI18n } from '../i18n';

type Tab = 'concerts' | 'comments';

export default function ModerationScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = localeFromI18n(i18n.language);
  const [tab, setTab] = useState<Tab>('concerts');

  const { concerts, loading: concertsLoading, error: concertsError, reload: reloadConcerts } =
    useReportedConcerts();
  const moderateConcert = useModerateConcert();
  const [busyConcertId, setBusyConcertId] = useState<string | null>(null);

  const { comments, loading: commentsLoading, error: commentsError, reload: reloadComments } =
    useReportedComments();
  const moderateComment = useModerateComment();
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);

  const handleDismissConcert = (concert: ReportedConcert) => {
    setBusyConcertId(concert.id);
    moderateConcert.mutate(
      { concertId: concert.id, action: 'dismiss' },
      {
        onSuccess: () => Alert.alert(t('moderation.dismissSuccess')),
        onError: (err: any) => Alert.alert(t('common.error'), err.message),
        onSettled: () => setBusyConcertId(null),
      },
    );
  };

  const handleDeleteConcert = (concert: ReportedConcert) => {
    Alert.alert(t('moderation.deleteConfirmTitle'), t('moderation.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.deleteButton'),
        style: 'destructive',
        onPress: () => {
          setBusyConcertId(concert.id);
          moderateConcert.mutate(
            { concertId: concert.id, action: 'delete' },
            {
              onSuccess: () => Alert.alert(t('moderation.deleteSuccess')),
              onError: (err: any) => Alert.alert(t('common.error'), err.message),
              onSettled: () => setBusyConcertId(null),
            },
          );
        },
      },
    ]);
  };

  const handleDismissComment = (comment: ReportedComment) => {
    setBusyCommentId(comment.id);
    moderateComment.mutate(
      { commentId: comment.id, action: 'dismiss' },
      {
        onSuccess: () => Alert.alert(t('moderation.dismissCommentSuccess')),
        onError: (err: any) => Alert.alert(t('common.error'), err.message),
        onSettled: () => setBusyCommentId(null),
      },
    );
  };

  const handleDeleteComment = (comment: ReportedComment) => {
    Alert.alert(t('moderation.deleteCommentConfirmTitle'), t('moderation.deleteCommentConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.deleteButton'),
        style: 'destructive',
        onPress: () => {
          setBusyCommentId(comment.id);
          moderateComment.mutate(
            { commentId: comment.id, action: 'delete' },
            {
              onSuccess: () => Alert.alert(t('moderation.deleteCommentSuccess')),
              onError: (err: any) => Alert.alert(t('common.error'), err.message),
              onSettled: () => setBusyCommentId(null),
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

      <View style={styles.tabsRow}>
        <TabPill
          label={t('moderation.concertsTab')}
          active={tab === 'concerts'}
          onPress={() => setTab('concerts')}
        />
        <TabPill
          label={t('moderation.commentsTab')}
          active={tab === 'comments'}
          onPress={() => setTab('comments')}
        />
      </View>

      {tab === 'concerts' ? (
        concertsLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.bloodBright} size="large" />
          </View>
        ) : concertsError ? (
          <View style={styles.centered}>
            <Text
              variant="bodySM"
              color="bloodBright"
              style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}
            >
              {concertsError}
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
            refreshing={concertsLoading}
            onRefresh={reloadConcerts}
            renderItem={({ item }) => {
              const headliner = item.bands.find((b) => b.is_headliner) ?? item.bands[0];
              const dateStr = new Date(item.event_date).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });
              const isBusy = busyConcertId === item.id && moderateConcert.isPending;

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
                      onPress={() => handleDismissConcert(item)}
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
                      onPress={() => handleDeleteConcert(item)}
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
        )
      ) : commentsLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : commentsError ? (
        <View style={styles.centered}>
          <Text
            variant="bodySM"
            color="bloodBright"
            style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}
          >
            {commentsError}
          </Text>
        </View>
      ) : comments.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title={t('moderation.emptyTitle')}
          description={t('moderation.emptyDesc')}
        />
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshing={commentsLoading}
          onRefresh={reloadComments}
          renderItem={({ item }) => {
            const isBusy = busyCommentId === item.id && moderateComment.isPending;

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="displaySM" numberOfLines={1}>
                      @{item.author.username}
                    </Text>
                    <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                      {item.target.label}
                    </Text>
                  </View>
                  <View style={styles.reportBadge}>
                    <Ionicons name="flag" size={12} color={colors.bloodBright} />
                    <Text variant="monoSM" color="bloodBright" style={{ marginLeft: 4 }}>
                      {t('moderation.reportsLabel', { count: item.report_count })}
                    </Text>
                  </View>
                </View>

                <Text variant="body" style={{ marginTop: spacing.sm }}>
                  {item.body}
                </Text>

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
                    onPress={() => handleDismissComment(item)}
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
                    onPress={() => handleDeleteComment(item)}
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

function TabPill({
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
      style={[styles.tabPill, active && styles.tabPillActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={{
          fontFamily: fontFamily.mono,
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: active ? colors.ink : colors.silver,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  tabPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'transparent',
  },
  tabPillActive: {
    backgroundColor: colors.silver,
    borderColor: colors.silver,
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
