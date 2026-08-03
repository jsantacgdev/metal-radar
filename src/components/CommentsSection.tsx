import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { Comment, CommentTargetType, CommentVisibility, StatusType, useComments } from '../hooks/useComments';
import { useReportComment } from '../hooks/useReportComment';
import { useProfile } from '../hooks/useProfile';
import { STATUS_CHIPS } from '../lib/statusChips';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from './ui';
import ReportReasonModal from './ReportReasonModal';
import StatusComposerModal from './StatusComposerModal';
import CommentRow from './CommentRow';

type Props = {
  targetType: CommentTargetType;
  targetId: string;
};

type ReplyTarget = { id: string; username: string | null };

export default function CommentsSection({ targetType, targetId }: Props) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { profile } = useProfile();
  const { comments, error, post, posting, remove } = useComments(targetType, targetId);
  const [text, setText] = useState('');
  const [textVisibility, setTextVisibility] = useState<CommentVisibility>('public');
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [statusModalType, setStatusModalType] = useState<StatusType | null>(null);
  const reportComment = useReportComment(reportTarget ?? '');

  const { topLevel, repliesByParent } = useMemo(() => {
    const top: Comment[] = [];
    const replies = new Map<string, Comment[]>();
    for (const c of comments) {
      if (!c.parent_comment_id) {
        top.push(c);
      } else {
        const list = replies.get(c.parent_comment_id) ?? [];
        list.push(c);
        replies.set(c.parent_comment_id, list);
      }
    }
    return { topLevel: top, repliesByParent: replies };
  }, [comments]);

  const handlePost = async () => {
    if (!text.trim()) return;
    const body = text;
    const parentId = replyingTo?.id ?? null;
    const visibility = profile?.is_private ? textVisibility : 'public';
    try {
      setText('');
      setReplyingTo(null);
      await post(body, parentId, { visibility });
    } catch (err: any) {
      setText(body);
      setReplyingTo(replyingTo);
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleStatusSubmit = async ({ note, visibility }: { note: string; visibility: CommentVisibility }) => {
    const statusType = statusModalType;
    if (!statusType) return;
    const chip = STATUS_CHIPS.find((c) => c.type === statusType);
    const label = chip ? t(chip.labelKey) : '';
    const body = note ? `${label} — ${note}` : label;
    setStatusModalType(null);
    try {
      await post(body, null, { commentType: 'status', statusType, visibility });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleReply = (comment: Comment) => {
    // Hilo a un solo nivel: responder a una respuesta cuelga del
    // comentario raíz, no crea un tercer nivel de anidamiento.
    const rootId = comment.parent_comment_id ?? comment.id;
    setReplyingTo({ id: rootId, username: comment.author.username });
  };

  const handleDelete = (commentId: string) => {
    Alert.alert(t('comments.deleteTitle'), t('comments.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => remove(commentId).catch((err: any) => Alert.alert(t('common.error'), err.message)),
      },
    ]);
  };

  const handleReportSubmit = async (reason: string | null) => {
    try {
      await reportComment.mutateAsync(reason ?? undefined);
      Alert.alert(t('comments.reportThanks'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="monoMD" color="muted" style={{ marginBottom: spacing.md }}>
        {t('comments.title', { count: comments.length })}
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text variant="bodySM" color="bloodBright">
            {error}
          </Text>
        </View>
      )}

      {topLevel.length === 0 ? (
        <Text variant="bodySM" color="muted">
          {t('comments.empty')}
        </Text>
      ) : (
        topLevel.map((comment) => (
          <View key={comment.id}>
            <CommentRow
              comment={comment}
              ownUserId={session?.user.id}
              onReply={() => handleReply(comment)}
              onDelete={() => handleDelete(comment.id)}
              onReport={() => setReportTarget(comment.id)}
            />
            {(repliesByParent.get(comment.id) ?? []).map((reply) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                ownUserId={session?.user.id}
                isReply
                onReply={() => handleReply(reply)}
                onDelete={() => handleDelete(reply.id)}
                onReport={() => setReportTarget(reply.id)}
              />
            ))}
          </View>
        ))
      )}

      {replyingTo && (
        <View style={styles.replyingBanner}>
          <Text variant="bodySM" color="muted">
            {t('comments.replyingTo', { username: replyingTo.username })}
          </Text>
          <TouchableOpacity
            onPress={() => setReplyingTo(null)}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.statusChipsRow}>
        {STATUS_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.type}
            style={styles.statusChip}
            onPress={() => setStatusModalType(chip.type)}
            activeOpacity={0.8}
          >
            <Ionicons name={chip.icon} size={13} color={colors.silver} />
            <Text variant="monoSM" color="silver" style={{ marginLeft: 6 }}>
              {t(chip.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {profile?.is_private && (
        <View style={styles.visibilityToggleRow}>
          <TouchableOpacity
            style={styles.visibilityToggleOption}
            onPress={() => setTextVisibility('followers')}
            activeOpacity={0.8}
          >
            <Ionicons
              name={textVisibility === 'followers' ? 'radio-button-on' : 'radio-button-off'}
              size={14}
              color={textVisibility === 'followers' ? colors.bloodBright : colors.muted}
            />
            <Text variant="monoSM" color={textVisibility === 'followers' ? 'bright' : 'muted'} style={{ marginLeft: 4 }}>
              {t('comments.visibility.followers')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.visibilityToggleOption}
            onPress={() => setTextVisibility('public')}
            activeOpacity={0.8}
          >
            <Ionicons
              name={textVisibility === 'public' ? 'radio-button-on' : 'radio-button-off'}
              size={14}
              color={textVisibility === 'public' ? colors.bloodBright : colors.muted}
            />
            <Text variant="monoSM" color={textVisibility === 'public' ? 'bright' : 'muted'} style={{ marginLeft: 4 }}>
              {t('comments.visibility.public')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('comments.placeholder')}
          placeholderTextColor={colors.faint}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || posting) && { opacity: 0.5 }]}
          onPress={handlePost}
          disabled={posting || !text.trim()}
          activeOpacity={0.8}
          accessibilityLabel={t('common.send')}
        >
          {posting ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Ionicons name="send" size={16} color={colors.onAccent} />
          )}
        </TouchableOpacity>
      </View>

      <ReportReasonModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        onSubmit={handleReportSubmit}
      />

      <StatusComposerModal
        visible={!!statusModalType}
        statusType={statusModalType}
        onClose={() => setStatusModalType(null)}
        onSubmit={handleStatusSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  errorBox: {
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
  },
  statusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  visibilityToggleRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  visibilityToggleOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    color: colors.bright,
    fontFamily: fontFamily.body,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.blood,
    borderWidth: 1,
    borderColor: colors.bloodBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
