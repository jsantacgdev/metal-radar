import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFollowList } from '../hooks/useUserFollows';
import { ProfileStackParamList } from '../navigation/ProfileStack';
import { colors, fontFamily, spacing } from '../theme';
import { Avatar, Text } from '../components/ui';
import EmptyState from '../components/EmptyState';

type Route = RouteProp<ProfileStackParamList, 'FollowList'>;

export default function FollowListScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { params } = useRoute<Route>();
  const { userId, mode } = params;

  const { users, loading } = useFollowList(userId, mode);

  const title = mode === 'followers' ? t('social.followers') : t('social.following');

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
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : users.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={mode === 'followers' ? t('social.emptyFollowersTitle') : t('social.emptyFollowingTitle')}
          description={
            mode === 'followers' ? t('social.emptyFollowersDesc') : t('social.emptyFollowingDesc')
          }
        />
      ) : (
        <View style={styles.listSection}>
          {users.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.row, i === users.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => navigation.push('PublicProfile', { userId: item.id })}
              activeOpacity={0.7}
            >
              <Avatar uri={item.avatar_url} />
              <View style={styles.rowContent}>
                <Text variant="displaySM" numberOfLines={1}>
                  @{item.username}
                </Text>
                {item.display_name && (
                  <Text variant="monoSM" color="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                    {item.display_name}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
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
  rowContent: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
});
