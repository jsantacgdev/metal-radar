import { StyleSheet, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useConversations } from '../hooks/useConversations';
import { ProfileStackParamList } from '../navigation/ProfileStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Avatar, Text } from '../components/ui';
import EmptyState from '../components/EmptyState';

export default function ConversationsScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const isFocused = useIsFocused();
  const { conversations, loading, error } = useConversations(isFocused);

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
        <Text style={styles.headerTitle}>{t('messages.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text variant="bodySM" color="bloodBright">
            {error}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title={t('messages.conversationsEmptyTitle')}
          description={t('messages.conversationsEmpty')}
        />
      ) : (
        <View style={styles.listSection}>
          {conversations.map((item, i) => {
            const label = item.username
              ? `@${item.username}`
              : item.displayName ?? t('common.anonymous');
            return (
              <TouchableOpacity
                key={item.otherId}
                style={[styles.row, i === conversations.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() =>
                  navigation.navigate('Chat', { userId: item.otherId, username: item.username })
                }
                activeOpacity={0.7}
              >
                <Avatar />
                <View style={styles.rowContent}>
                  <Text variant="displaySM" numberOfLines={1}>
                    {label}
                  </Text>
                  <Text
                    variant="bodySM"
                    color={item.unreadCount > 0 ? 'bright' : 'muted'}
                    numberOfLines={1}
                    style={{ marginTop: 2 }}
                  >
                    {item.lastBody}
                  </Text>
                </View>
                <View style={styles.rowMeta}>
                  <Text variant="monoSM" color="muted">
                    {new Date(item.lastCreatedAt).toLocaleDateString(i18n.language, {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </Text>
                  {item.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
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
  errorBox: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
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
  rowMeta: { alignItems: 'flex-end', marginLeft: spacing.sm },
  unreadBadge: {
    marginTop: 6,
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.blood,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeText: {
    color: colors.onAccent,
    fontFamily: fontFamily.displayBold,
    fontSize: 10,
  },
});
