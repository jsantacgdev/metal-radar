import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { Comment, CommentTargetType, CommentVisibility, StatusType, useComments } from '../hooks/useComments';
import { useCommentReaction } from '../hooks/useCommentReaction';
import { useReportComment } from '../hooks/useReportComment';
import { useBlockUser } from '../hooks/useBlockUser';
import { useProfile } from '../hooks/useProfile';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from './ui';
import ReportReasonModal from './ReportReasonModal';
import StatusComposerModal from './StatusComposerModal';

// CommentsSection se renderiza dentro de varios stacks (Map, Diary,
// Feed, Profile), cada uno con su propio ParamList — todos registran
// una pantalla "Chat" con esta misma forma, así que basta con este
// subconjunto mínimo para poder navegar sin acoplarse a un stack concreto.
type ChatParamList = { Chat: { userId: string; username: string | null } };

const STATUS_CHIPS: { type: StatusType; icon: keyof typeof Ionicons.glyphMap; labelKey: string }[] = [
  { type: 'going_alone', icon: 'person-outline', labelKey: 'comments.status.goingAlone' },
  { type: 'has_car_space', icon: 'car-outline', labelKey: 'comments.status.hasCarSpace' },
  { type: 'looking_for_ride', icon: 'hand-left-outline', labelKey: 'comments.status.lookingForRide' },
];

type Props = {
  targetType: CommentTargetType;
  targetId: string;
};

type ReplyTarget = { id: string; username: string | null };

export default function CommentsSection({ targetType, targetId }: Props) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { profile } = useProfile();
  const { comments, post, posting, remove } = useComments(targetType, targetId);
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
    try {
      const body = text;
      const parentId = replyingTo?.id ?? null;
      const visibility = profile?.is_private ? textVisibility : 'public';
      setText('');
      setReplyingTo(null);
      await post(body, parentId, { visibility });
    } catch (err: any) {
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
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="send" size={16} color="#fff" />
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

function CommentRow({
  comment,
  ownUserId,
  isReply,
  onReply,
  onDelete,
  onReport,
}: {
  comment: Comment;
  ownUserId: string | undefined;
  isReply?: boolean;
  onReply: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ChatParamList>>();
  const { count, reacted, toggle } = useCommentReaction(comment.id);
  const { block } = useBlockUser(comment.author.id);
  const isOwn = comment.author.id === ownUserId;

  const handleBlock = () => {
    Alert.alert(t('social.blockTitle'), t('social.blockBody', { username: comment.author.username }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('social.block'),
        style: 'destructive',
        onPress: () => block().catch((err: any) => Alert.alert(t('common.error'), err.message)),
      },
    ]);
  };

  const handleMenu = () => {
    Alert.alert(t('comments.menuTitle'), undefined, [
      {
        text: t('comments.sendMessage'),
        onPress: () =>
          navigation.navigate('Chat', { userId: comment.author.id, username: comment.author.username }),
      },
      { text: t('comments.report'), onPress: onReport },
      { text: t('social.block'), style: 'destructive', onPress: handleBlock },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const statusChip = comment.comment_type === 'status'
    ? STATUS_CHIPS.find((c) => c.type === comment.status_type)
    : undefined;

  return (
    <View style={[styles.commentRow, isReply && styles.replyRow]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.commentAuthorRow}>
          <Text variant="bodySM" color="silver">
            @{comment.author.username}
          </Text>
          {comment.visibility === 'followers' && (
            <View style={styles.visibilityBadge}>
              <Ionicons name="lock-closed" size={10} color={colors.muted} />
              <Text variant="monoSM" color="muted" style={{ marginLeft: 3 }}>
                {t('comments.visibility.followersBadge')}
              </Text>
            </View>
          )}
        </View>
        {statusChip ? (
          <View style={styles.statusBody}>
            <Ionicons name={statusChip.icon} size={14} color={colors.bloodBright} />
            <Text variant="body" style={{ marginLeft: 6, flex: 1 }}>
              {comment.body}
            </Text>
          </View>
        ) : (
          <Text variant="body" style={{ marginTop: 2 }}>
            {comment.body}
          </Text>
        )}
        <View style={styles.commentActionsRow}>
          <TouchableOpacity
            style={styles.commentAction}
            onPress={() => toggle().catch(() => {})}
            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
            accessibilityLabel={t('common.like')}
          >
            <Ionicons
              name={reacted ? 'heart' : 'heart-outline'}
              size={14}
              color={reacted ? colors.bloodBright : colors.muted}
            />
            {count > 0 && (
              <Text variant="monoSM" color={reacted ? 'bloodBright' : 'muted'} style={{ marginLeft: 4 }}>
                {count}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.commentAction} onPress={onReply}>
            <Text variant="monoSM" color="muted">
              {t('comments.reply')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {isOwn ? (
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          accessibilityLabel={t('common.delete')}
        >
          <Ionicons name="trash-outline" size={16} color={colors.muted} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={handleMenu}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          accessibilityLabel={t('common.more')}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.muted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  replyRow: {
    marginLeft: spacing.xl,
    borderBottomWidth: 0,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  commentActionsRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
    gap: spacing.md,
  },
  commentAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBody: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
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
