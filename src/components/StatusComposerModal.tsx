import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CommentVisibility, StatusType } from '../hooks/useComments';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from './ui';

type Props = {
  visible: boolean;
  statusType: StatusType | null;
  onClose: () => void;
  onSubmit: (params: { note: string; visibility: CommentVisibility }) => void;
};

const STATUS_LABEL_KEYS: Record<StatusType, string> = {
  going_alone: 'comments.status.goingAlone',
  has_car_space: 'comments.status.hasCarSpace',
  looking_for_ride: 'comments.status.lookingForRide',
};

export default function StatusComposerModal({ visible, statusType, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [visibility, setVisibility] = useState<CommentVisibility>('followers');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setVisibility('followers');
      setNote('');
    }
  }, [visible]);

  if (!statusType) return null;

  const handleSubmit = () => {
    onSubmit({ note: note.trim(), visibility });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.header}>
            <Text variant="displaySM">{t(STATUS_LABEL_KEYS[statusType])}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <Text variant="monoSM" color="muted" style={styles.sectionTitle}>
            {t('comments.visibility.title')}
          </Text>
          <View style={styles.visibilityRow}>
            <TouchableOpacity
              style={[styles.visibilityOption, visibility === 'followers' && styles.visibilityOptionActive]}
              onPress={() => setVisibility('followers')}
              activeOpacity={0.8}
            >
              <Text variant="body" color={visibility === 'followers' ? 'bright' : 'muted'}>
                {t('comments.visibility.followers')}
              </Text>
              <Text variant="bodySM" color="muted">
                {t('comments.visibility.followersHint')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.visibilityOption, visibility === 'public' && styles.visibilityOptionActive]}
              onPress={() => setVisibility('public')}
              activeOpacity={0.8}
            >
              <Text variant="body" color={visibility === 'public' ? 'bright' : 'muted'}>
                {t('comments.visibility.public')}
              </Text>
              <Text variant="bodySM" color="muted">
                {t('comments.visibility.publicHint')}
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('comments.status.notePlaceholder')}
            placeholderTextColor={colors.faint}
            style={styles.noteInput}
            multiline
          />

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.8}>
            <Text style={styles.submitBtnText}>{t('comments.status.publish')}</Text>
          </TouchableOpacity>
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
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  visibilityOption: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  visibilityOptionActive: {
    borderColor: colors.bloodBright,
    backgroundColor: colors.blood,
  },
  noteInput: {
    minHeight: 60,
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
