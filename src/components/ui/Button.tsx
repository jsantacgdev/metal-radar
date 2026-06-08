import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from 'react-native';
import { colors, fontFamily, radius, spacing } from '../../theme';
import Text from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = TouchableOpacityProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
};

export default function Button({
  label,
  variant = 'primary',
  loading,
  icon,
  fullWidth = true,
  disabled,
  style,
  ...rest
}: Props) {
  const variants = {
    primary: {
      bg: colors.blood,
      border: colors.bloodBright,
      text: '#fff',
      shadow: true,
    },
    secondary: {
      bg: colors.panel2,
      border: colors.line,
      text: colors.bright,
      shadow: false,
    },
    ghost: {
      bg: 'transparent',
      border: colors.line,
      text: colors.silver,
      shadow: false,
    },
    danger: {
      bg: 'transparent',
      border: colors.bloodTintBorder,
      text: colors.bloodBright,
      shadow: false,
    },
  } as const;

  const v = variants[variant];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          shadowOpacity: v.shadow ? 0.35 : 0,
        },
        fullWidth && { width: '100%' },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            style={{
              color: v.text,
              fontFamily: fontFamily.bodyBold,
              fontSize: 14,
              letterSpacing: 0.3,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#cf2e24',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 0,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
