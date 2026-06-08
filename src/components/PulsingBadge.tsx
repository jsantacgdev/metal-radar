import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { colors, fontFamily, radius } from '../theme';

export default function PulsingBadge({ label = 'NUEVO' }: { label?: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <Animated.View style={[styles.badge, { transform: [{ scale }] }]}>
      <Animated.Text style={styles.text}>{label}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginRight: 10,
  },
  text: {
    color: colors.bloodBright,
    fontSize: 9,
    fontFamily: fontFamily.monoBold,
    letterSpacing: 1,
  },
});
