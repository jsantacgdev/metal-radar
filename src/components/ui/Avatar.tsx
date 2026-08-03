import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

type Props = {
  size?: number;
};

export default function Avatar({ size = 44 }: Props) {
  const iconSize = Math.round(size * 0.45);

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Ionicons name="person" size={iconSize} color={colors.silver} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
