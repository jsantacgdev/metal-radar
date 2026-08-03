import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFollowRequests } from '../hooks/useUserFollows';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Avatar, Text } from '../components/ui';
import EmptyState from '../components/EmptyState';

export default function FollowRequestsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { requests, loading, reload, accept, reject } = useFollowRequests();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAccept = async (followerId: string) => {
    try {
      setBusyId(followerId);
      await accept(followerId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (followerId: string) => {
    try {
      setBusyId(followerId);
      await reject(followerId);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setBusyId(null);
    }
  };

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
        <Text style={styles.headerTitle}>{t('social.followRequestsTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && requests.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : requests.length === 0 ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.bloodBright} />}
        >
          <EmptyState
            icon="person-add-outline"
            title={t('social.emptyRequestsTitle')}
            description={t('social.emptyRequestsDesc')}
          />
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.listSection}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.bloodBright} />}
        >
          {requests.map((item, i) => {
            const isBusy = busyId === item.follower_id;
            return (
              <View
                key={item.follower_id}
                style={[styles.row, i === requests.length - 1 && { borderBottomWidth: 0 }]}
              >
                <Avatar />
                <View style={styles.rowContent}>
                  <Text variant="displaySM" numberOfLines={1}>
                    @{item.profile.username}
                  </Text>
                  {item.profile.display_name && (
                    <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                      {item.profile.display_name}
                    </Text>
                  )}
                </View>
                {isBusy ? (
                  <ActivityIndicator color={colors.bloodBright} style={{ marginRight: spacing.sm }} />
                ) : (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleReject(item.follower_id)}
                      activeOpacity={0.7}
                      accessibilityLabel={t('social.reject')}
                    >
                      <Ionicons name="close" size={18} color={colors.silver} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAccept(item.follower_id)}
                      activeOpacity={0.7}
                      accessibilityLabel={t('social.accept')}
                    >
                      <Ionicons name="checkmark" size={18} color={colors.onAccent} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
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
  listSection: { paddingHorizontal: spacing.xl, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  rowContent: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.blood,
    borderWidth: 1,
    borderColor: colors.bloodBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
