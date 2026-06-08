import { StyleSheet, View, ViewProps } from 'react-native';
import { colors, radius, spacing } from '../../theme';

type Props = ViewProps & {
  variant?: 'panel' | 'panel2';
  noPadding?: boolean;
};

export default function Card({ variant = 'panel', noPadding, style, children, ...rest }: Props) {
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: variant === 'panel' ? colors.panel : colors.panel2,
          padding: noPadding ? 0 : spacing.lg,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
  },
});
