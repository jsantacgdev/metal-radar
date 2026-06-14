import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { colors, fontFamily, radius } from '../theme';

export default function PulsingBadge({ label }: { label?: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.05, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  if (!label) return null;

  return (
    <Animated.View style={[styles.badge, { transform: [{ scale }] }]}>
      <Animated.Text style={styles.text}>{label}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.bloodBright,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    marginLeft: 6,
  },
  text: {
    color: '#fff',
    fontSize: 9,
    fontFamily: fontFamily.monoBold,
    letterSpacing: 1.2,
    lineHeight: 10,
  },
});
