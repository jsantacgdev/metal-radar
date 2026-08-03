import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Comment } from '../hooks/useComments';
import { useCommentReaction } from '../hooks/useCommentReaction';
import { useBlockUser } from '../hooks/useBlockUser';
import { STATUS_CHIPS } from '../lib/statusChips';
import { colors, spacing } from '../theme';
import { Text } from './ui';

// CommentsSection/CommentRow se renderizan dentro de varios stacks (Map,
// Diary, Feed, Profile), cada uno con su propio ParamList — todos registran
// una pantalla "Chat" con esta misma forma, así que basta con este
// subconjunto mínimo para poder navegar sin acoplarse a un stack concreto.
type ChatParamList = { Chat: { userId: string; username: string | null } };

export default function CommentRow({
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
  const { count, reacted, toggling, toggle } = useCommentReaction(comment.id);
  const { block } = useBlockUser(comment.author.id);
  const isOwn = comment.author.id === ownUserId;
  const authorLabel = comment.author.username
    ? `@${comment.author.username}`
    : comment.author.display_name ?? t('common.anonymous');

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
            {authorLabel}
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
            disabled={toggling}
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
});
