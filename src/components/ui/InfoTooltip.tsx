import { useRef, useState } from 'react';
import { Dimensions, Linking, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';
import Text from './Text';

type Props = {
  text: string;
  url?: string;
  size?: number;
};

const BUBBLE_WIDTH = 220;

export default function InfoTooltip({ text, url, size = 14 }: Props) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const iconRef = useRef<View>(null);

  const handlePress = () => {
    iconRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get('window').width;
      const left = Math.min(
        Math.max(spacing.md, x + width / 2 - BUBBLE_WIDTH / 2),
        screenWidth - BUBBLE_WIDTH - spacing.md,
      );
      setPosition({ top: y + height + 6, left });
      setVisible(true);
    });
  };

  const handleLinkPress = () => {
    setVisible(false);
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <>
      <TouchableOpacity
        ref={iconRef}
        onPress={handlePress}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        accessibilityLabel={text}
      >
        <Ionicons name="information-circle-outline" size={size} color={colors.muted} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)}>
          {position && (
            <View style={[styles.bubble, { top: position.top, left: position.left }]}>
              {url ? (
                <TouchableOpacity onPress={handleLinkPress} activeOpacity={0.7}>
                  <Text variant="monoSM" color="bloodBright">
                    {text}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text variant="monoSM" color="bright">
                  {text}
                </Text>
              )}
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    width: BUBBLE_WIDTH,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
