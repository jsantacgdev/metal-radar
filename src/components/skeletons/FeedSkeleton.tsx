import { StyleSheet, View } from 'react-native';
import Skeleton from '../Skeleton';
import { colors, radius, spacing } from '../../theme';

export default function FeedSkeleton() {
  return (
    <View style={styles.container}>
      {[...Array(5)].map((_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton width={40} height={40} borderRadius={radius.full} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Skeleton width={'85%' as any} height={14} />
            <Skeleton width={60} height={10} style={{ marginTop: 8 }} />
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
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
});
