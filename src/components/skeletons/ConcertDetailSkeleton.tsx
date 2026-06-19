import { StyleSheet, View } from 'react-native';
import Skeleton from '../Skeleton';
import { colors, radius, spacing } from '../../theme';

export default function ConcertDetailSkeleton() {
  return (
    <View style={{ flex: 1 }}>
      {/* Hero */}
      <View style={styles.hero}>
        <Skeleton width={140} height={140} borderRadius={radius.lg} />
        <View style={{ flex: 1, marginLeft: spacing.lg }}>
          <Skeleton width={80} height={11} />
          <Skeleton width={'90%' as any} height={26} style={{ marginTop: spacing.sm }} />
          <Skeleton width={'60%' as any} height={12} style={{ marginTop: 8 }} />
        </View>
      </View>

      {/* Meta strip */}
      <View style={styles.meta}>
        <Skeleton width={60} height={64} borderRadius={radius.md} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Skeleton width={'70%' as any} height={18} />
          <Skeleton width={'50%' as any} height={11} style={{ marginTop: 6 }} />
          <Skeleton width={'80%' as any} height={11} style={{ marginTop: 6 }} />
        </View>
      </View>

      {/* Status section */}
      <View style={styles.section}>
        <Skeleton width={100} height={11} />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Skeleton width={100} height={36} borderRadius={20} />
          <Skeleton width={100} height={36} borderRadius={20} />
          <Skeleton width={100} height={36} borderRadius={20} />
        </View>
      </View>

      {/* Lineup */}
      <View style={styles.section}>
        <Skeleton width={80} height={11} />
        {[...Array(3)].map((_, i) => (
          <View key={i} style={styles.bandRow}>
            <Skeleton width={44} height={44} circle />
            <Skeleton width={'60%' as any} height={16} style={{ marginLeft: spacing.md }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
  },
  section: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
});
