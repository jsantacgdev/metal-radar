import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useConnections } from '../hooks/useConnections';
import { ProfileStackParamList } from '../navigation/ProfileStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Avatar, Text } from '../components/ui';
import EmptyState from '../components/EmptyState';

export default function NewMessageScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { connections, loading, error } = useConnections();

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
        <Text style={styles.headerTitle}>{t('messages.newMessageTitle')}</Text>
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
      ) : connections.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={t('messages.noConnectionsTitle')}
          description={t('messages.noConnectionsDesc')}
        />
      ) : (
        <View style={styles.listSection}>
          {connections.map((item, i) => {
            const label = item.username ? `@${item.username}` : item.display_name ?? t('common.anonymous');
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.row, i === connections.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() =>
                  navigation.replace('Chat', { userId: item.id, username: item.username })
                }
                activeOpacity={0.7}
              >
                <Avatar uri={item.avatar_url} />
                <View style={styles.rowContent}>
                  <Text variant="displaySM" numberOfLines={1}>
                    {label}
                  </Text>
                  {item.display_name && item.username && (
                    <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                      {item.display_name}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
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
});
