import { ScrollView, StyleSheet, View } from 'react-native';
import Skeleton from '../Skeleton';
import { colors, radius, spacing } from '../../theme';

export default function RadarSkeleton() {
  return (
    <View>
      {/* Section title */}
      <Skeleton width={120} height={12} style={{ marginVertical: spacing.md }} />

      {/* Carrusel "Nuevo para ti" */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
      >
        {[...Array(4)].map((_, i) => (
          <View key={i} style={styles.card}>
            <Skeleton width={138} height={138} borderRadius={radius.lg} />
            <Skeleton width={100} height={14} style={{ marginTop: spacing.sm }} />
            <Skeleton width={70} height={10} style={{ marginTop: 6 }} />
          </View>
        ))}
      </ScrollView>

      {/* Section title */}
      <Skeleton
        width={140}
        height={12}
        style={{ marginTop: spacing.xl, marginBottom: spacing.md }}
      />

      {/* Lista emerging */}
      {[...Array(5)].map((_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={50} height={50} circle />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Skeleton width={140} height={14} />
            <Skeleton width={90} height={10} style={{ marginTop: 6 }} />
          </View>
          <Skeleton width={32} height={32} circle />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: { gap: spacing.md, paddingRight: spacing.md },
  card: { width: 138 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
});
