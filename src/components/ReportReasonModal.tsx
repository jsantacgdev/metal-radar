import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from './ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string | null) => void;
};

const REASON_KEYS = [
  'doesNotExist',
  'wrongDate',
  'wrongVenue',
  'wrongLineup',
  'duplicate',
  'other',
] as const;

export default function ReportReasonModal({ visible, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<(typeof REASON_KEYS)[number] | null>(null);
  const [otherText, setOtherText] = useState('');

  const handleClose = () => {
    setSelected(null);
    setOtherText('');
    onClose();
  };

  const handleSelect = (key: (typeof REASON_KEYS)[number]) => {
    if (key === 'other') {
      setSelected('other');
      return;
    }
    const reason = t(`reportReason.${key}`);
    setSelected(null);
    setOtherText('');
    onClose();
    onSubmit(reason);
  };

  const handleSubmitOther = () => {
    const text = otherText.trim();
    setSelected(null);
    setOtherText('');
    onClose();
    onSubmit(text.length > 0 ? text : null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.header}>
            <Text variant="displaySM">{t('reportReason.title')}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {REASON_KEYS.map((key) => (
            <TouchableOpacity
              key={key}
              style={styles.reasonRow}
              onPress={() => handleSelect(key)}
              activeOpacity={0.7}
            >
              <Text variant="body">{t(`reportReason.${key}`)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </TouchableOpacity>
          ))}

          {selected === 'other' && (
            <View style={styles.otherBox}>
              <TextInput
                value={otherText}
                onChangeText={setOtherText}
                placeholder={t('reportReason.otherPlaceholder')}
                placeholderTextColor={colors.faint}
                style={styles.otherInput}
                multiline
                autoFocus
              />
              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitOther} activeOpacity={0.8}>
                <Text style={styles.submitBtnText}>{t('reportReason.submitButton')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: colors.ink,
    borderTopWidth: 1,
    borderColor: colors.line,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  otherBox: {
    marginTop: spacing.md,
  },
  otherInput: {
    minHeight: 70,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    color: colors.bright,
    fontFamily: fontFamily.body,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  submitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blood,
    borderWidth: 1,
    borderColor: colors.bloodBright,
    borderRadius: radius.lg,
    paddingVertical: 14,
    marginTop: spacing.md,
  },
  submitBtnText: {
    color: '#fff',
    fontFamily: fontFamily.displayBold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
