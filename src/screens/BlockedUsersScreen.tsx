import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useBlockedUsers, useBlockUser } from '../hooks/useBlockUser';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import EmptyState from '../components/EmptyState';

function UnblockRow({
  user,
  onUnblocked,
}: {
  user: { id: string; username: string | null; display_name: string | null };
  onUnblocked: () => void;
}) {
  const { t } = useTranslation();
  const { unblock, loading } = useBlockUser(user.id);

  const handleUnblock = () => {
    Alert.alert(t('social.unblockTitle'), t('social.unblockBody', { username: user.username }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('social.unblock'),
        style: 'destructive',
        onPress: async () => {
          try {
            await unblock();
            onUnblocked();
          } catch (err: any) {
            Alert.alert(t('common.error'), err.message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={20} color={colors.silver} />
      </View>
      <View style={styles.rowContent}>
        <Text variant="displaySM" numberOfLines={1}>
          @{user.username}
        </Text>
        {user.display_name && (
          <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
            {user.display_name}
          </Text>
        )}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.bloodBright} />
      ) : (
        <TouchableOpacity style={styles.unblockBtn} onPress={handleUnblock} activeOpacity={0.7}>
          <Text variant="monoSM" color="silver">
            {t('social.unblock')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { users, loading, reload } = useBlockedUsers();

  const visibleUsers = users.filter((u) => !dismissed.has(u.id));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('social.blockedUsersTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : visibleUsers.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title={t('social.emptyBlockedTitle')}
          description={t('social.emptyBlockedDesc')}
        />
      ) : (
        <View style={styles.listSection}>
          {visibleUsers.map((item, i) => (
            <View key={item.id} style={i === visibleUsers.length - 1 ? { borderBottomWidth: 0 } : undefined}>
              <UnblockRow
                user={item}
                onUnblocked={() => {
                  setDismissed((prev) => new Set(prev).add(item.id));
                  reload();
                }}
              />
            </View>
          ))}
        </View>
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  unblockBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
});
