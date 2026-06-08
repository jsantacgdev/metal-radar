import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, fontFamily, radius, spacing } from '../../theme';
import Text from './Text';

type Tone = 'steel' | 'blood' | 'solid';

type Props = {
  children: string;
  tone?: Tone;
  style?: ViewStyle;
};

export default function Tag({ children, tone = 'steel', style }: Props) {
  const tones = {
    steel: {
      color: colors.silver,
      border: colors.line,
      bg: 'rgba(255,255,255,0.03)',
    },
    blood: {
      color: colors.bloodBright,
      border: colors.bloodTintBorder,
      bg: colors.bloodTint,
    },
    solid: {
      color: colors.ink,
      border: 'transparent',
      bg: colors.silver,
    },
  } as const;

  const t = tones[tone];

  return (
    <View style={[styles.base, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      <Text
        style={{
          color: t.color,
          fontFamily: fontFamily.mono,
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
