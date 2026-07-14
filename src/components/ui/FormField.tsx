import { useState } from 'react';
import { TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '../../theme';
import Text from './Text';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  isPassword?: boolean;
};

export default function FormField({ label, error, isPassword, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="monoSM" color="muted" style={{ paddingLeft: spacing.xs }}>
        {label}
      </Text>
      <View style={{ position: 'relative', justifyContent: 'center' }}>
        <TextInput
          style={[
            {
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: error ? colors.bloodBright : focused ? colors.bloodBright : colors.line,
              borderRadius: radius.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md + 2,
              paddingRight: isPassword ? spacing.xxl + spacing.sm : spacing.lg,
              fontSize: 16,
              color: colors.bright,
              fontFamily: fontFamily.body,
            },
            style,
          ]}
          placeholderTextColor={colors.faint}
          secureTextEntry={isPassword && !visible}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {isPassword && (
          <TouchableOpacity
            style={{ position: 'absolute', right: spacing.md, padding: spacing.xs }}
            onPress={() => setVisible((v) => !v)}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text variant="bodySM" color="bloodBright" style={{ paddingLeft: spacing.xs }}>
          {error}
        </Text>
      )}
    </View>
  );
}
