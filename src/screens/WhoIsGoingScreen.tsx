import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useWhoIsGoing } from '../hooks/useWhoIsGoing';
import { MapStackParamList } from '../navigation/MapStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';

type Route = RouteProp<MapStackParamList, 'WhoIsGoing'>;

const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  interested: 'bookmark-outline',
  going: 'checkmark-circle',
  attended: 'trophy',
};

export default function WhoIsGoingScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList>>();
  const { params } = useRoute<Route>();
  const { targetType, targetId } = params;

  const { users, loading } = useWhoIsGoing(targetType, targetId);

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
        <Text style={styles.headerTitle}>{t('social.whoIsGoing')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : (
        <View style={styles.listSection}>
          {users.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.row, i === users.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color={colors.silver} />
              </View>
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
              <Ionicons name={STATUS_ICON[item.status]} size={18} color={colors.bloodBright} />
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
});
