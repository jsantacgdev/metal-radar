import { StyleSheet, View } from 'react-native';
import Skeleton from '../Skeleton';
import { colors, radius, spacing } from '../../theme';

export default function FestivalDetailSkeleton() {
  return (
    <View style={{ flex: 1 }}>
      {/* Hero image grande */}
      <Skeleton width={'100%' as any} height={280} borderRadius={0} />

      <View style={{ padding: spacing.xl }}>
        {/* Nombre */}
        <Skeleton width={'80%' as any} height={32} />

        {/* Date strip */}
        <View style={styles.dateStrip}>
          <Skeleton width={110} height={50} borderRadius={radius.sm} />
          <View style={{ flex: 1, marginLeft: spacing.lg }}>
            <Skeleton width={60} height={10} />
            <Skeleton width={'70%' as any} height={16} style={{ marginTop: 4 }} />
            <Skeleton width={'50%' as any} height={11} style={{ marginTop: 4 }} />
          </View>
        </View>

        {/* Status section */}
        <Skeleton width={100} height={11} style={{ marginTop: spacing.xl }} />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <Skeleton width={100} height={36} borderRadius={20} />
          <Skeleton width={100} height={36} borderRadius={20} />
          <Skeleton width={100} height={36} borderRadius={20} />
        </View>

        {/* Bio */}
        <View style={{ marginTop: spacing.xl }}>
          <Skeleton width={'100%' as any} height={12} />
          <Skeleton width={'95%' as any} height={12} style={{ marginTop: 6 }} />
          <Skeleton width={'70%' as any} height={12} style={{ marginTop: 6 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dateStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
});
