import { Image, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, fontFamily, radius } from '../theme';
import Text from './ui/Text';

type Props = {
  url: string | null;
  size?: number;
  radiusOverride?: number;
  showTag?: boolean;
  style?: StyleProp<ImageStyle & ViewStyle>;
};

export default function BandImage({
  url,
  size = 50,
  radiusOverride,
  showTag = false,
  style,
}: Props) {
  const r = radiusOverride ?? radius.md;

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[{ width: size, height: size, borderRadius: r }, style as StyleProp<ImageStyle>]}
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: colors.panel2,
          borderWidth: 1,
          borderColor: colors.line,
          overflow: 'hidden',
        },
        style as StyleProp<ViewStyle>,
      ]}
    >
      <View style={styles.stripes} />
      {showTag && (
        <View style={styles.tag}>
          <Text
            style={{
              fontFamily: fontFamily.mono,
              fontSize: 8,
              color: colors.faint,
              letterSpacing: 1,
            }}
          >
            ◳ IMG
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stripes: {
    flex: 1,
    backgroundColor: colors.panel2,
    opacity: 0.5,
  },
  tag: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
});
