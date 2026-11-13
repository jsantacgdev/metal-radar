import { StyleSheet, View } from 'react-native';
import Skeleton from '../Skeleton';
import { colors, spacing } from '../../theme';

export default function BandDetailSkeleton() {
  return (
    <View style={{ flex: 1 }}>
      {/* Meta strip */}
      <View style={styles.meta}>
        {[...Array(3)].map((_, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Skeleton width={50} height={22} />
            <Skeleton width={70} height={10} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* Bio */}
      <View style={styles.section}>
        <Skeleton width={80} height={11} />
        <View style={{ marginTop: spacing.md }}>
          <Skeleton width={'100%' as any} height={12} />
          <Skeleton width={'95%' as any} height={12} style={{ marginTop: 6 }} />
          <Skeleton width={'90%' as any} height={12} style={{ marginTop: 6 }} />
          <Skeleton width={'60%' as any} height={12} style={{ marginTop: 6 }} />
        </View>
      </View>

      {/* Miembros */}
      <View style={styles.section}>
        <Skeleton width={80} height={11} />
        {[...Array(4)].map((_, i) => (
          <View key={i} style={styles.memberRow}>
            <Skeleton width={14} height={14} circle />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Skeleton width={'50%' as any} height={16} />
              <Skeleton width={80} height={10} style={{ marginTop: 4 }} />
            </View>
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: spacing.lg,
  },
  section: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
});
