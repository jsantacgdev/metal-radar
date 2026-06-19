import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  circle?: boolean;
  style?: ViewStyle;
};

export default function Skeleton({
  width = '100%',
  height = 16,
  borderRadius: radiusOverride,
  circle,
  style,
}: Props) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const finalRadius = circle
    ? typeof height === 'number'
      ? height / 2
      : radius.full
    : (radiusOverride ?? radius.sm);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 400],
  });

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: finalRadius,
          backgroundColor: colors.panel,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.shimmer,
          {
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shimmer: {
    width: 150,
    height: '100%',
    backgroundColor: colors.panel2,
    opacity: 0.7,
    transform: [{ skewX: '-20deg' }],
  },
});
