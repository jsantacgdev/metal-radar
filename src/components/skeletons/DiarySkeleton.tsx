import { StyleSheet, View } from 'react-native';
import Skeleton from '../Skeleton';
import { colors, radius, spacing } from '../../theme';

export default function DiarySkeleton() {
  return (
    <View style={styles.container}>
      {[...Array(4)].map((_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton width={48} height={48} borderRadius={radius.sm} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Skeleton width={'55%' as any} height={16} />
              <View style={{ flex: 1 }} />
              <Skeleton width={60} height={10} />
            </View>
            <Skeleton width={'80%' as any} height={11} style={{ marginTop: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
});
