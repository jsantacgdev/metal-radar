import { View } from 'react-native';
import { colors } from '../../theme';

type Props = {
  soft?: boolean;
};

export default function Divider({ soft }: Props) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: soft ? colors.lineSoft : colors.line,
      }}
    />
  );
}
