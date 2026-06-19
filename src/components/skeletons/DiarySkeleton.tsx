import { StyleSheet, View } from 'react-native';
import Skeleton from '../Skeleton';
import { colors, radius, spacing } from '../../theme';

export default function DiarySkeleton() {
  return (
    <View style={{ padding: spacing.xl }}>
      {/* Stats banner */}
      <Skeleton width={'100%' as any} height={80} borderRadius={radius.md} />

      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
        <Skeleton width={90} height={32} borderRadius={radius.sm} />
        <Skeleton width={90} height={32} borderRadius={radius.sm} />
      </View>

      {/* Cards */}
      {[...Array(4)].map((_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton width={50} height={50} circle />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Skeleton width={'70%' as any} height={16} />
            <Skeleton width={'50%' as any} height={11} style={{ marginTop: 6 }} />
            <Skeleton width={'40%' as any} height={10} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
});
