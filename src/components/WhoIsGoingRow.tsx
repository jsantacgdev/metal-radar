import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useWhoIsGoing, WhoIsGoingTargetType } from '../hooks/useWhoIsGoing';
import { colors, radius, spacing } from '../theme';
import { Text } from './ui';

type Props = {
  targetType: WhoIsGoingTargetType;
  targetId: string;
  onPress: () => void;
};

export default function WhoIsGoingRow({ targetType, targetId, onPress }: Props) {
  const { t } = useTranslation();
  const { users } = useWhoIsGoing(targetType, targetId);

  if (users.length === 0) return null;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarStack}>
        {users.slice(0, 5).map((u, i) => (
          <View key={u.id} style={[styles.avatar, i > 0 && { marginLeft: -10 }]}>
            <Ionicons name="person" size={14} color={colors.silver} />
          </View>
        ))}
      </View>
      <Text variant="bodySM" color="silver" style={{ marginLeft: spacing.sm, flex: 1 }}>
        {t('social.peopleYouFollowGoing', { count: users.length })}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  avatarStack: { flexDirection: 'row' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.panel2,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
