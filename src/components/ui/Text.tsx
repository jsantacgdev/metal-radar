import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';
import { colors, textStyles, TextVariant, ColorKey } from '../../theme';

type Props = RNTextProps & {
  variant?: TextVariant;
  color?: ColorKey;
  style?: TextStyle | TextStyle[];
};

export default function Text({ variant = 'body', color, style, children, ...rest }: Props) {
  const baseStyle = textStyles[variant];
  const colorOverride = color ? { color: colors[color] } : undefined;

  return (
    <RNText style={[baseStyle, colorOverride, style]} {...rest}>
      {children}
    </RNText>
  );
}
