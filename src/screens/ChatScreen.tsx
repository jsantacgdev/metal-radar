import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { DirectMessage, useDirectMessages } from '../hooks/useDirectMessages';
import { useBlockUser } from '../hooks/useBlockUser';
import { useReportUser } from '../hooks/useReportUser';
import { ProfileStackParamList } from '../navigation/ProfileStack';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import ReportReasonModal from '../components/ReportReasonModal';

type Route = RouteProp<ProfileStackParamList, 'Chat'>;

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { params } = useRoute<Route>();
  const { userId, username } = params;
  const { session } = useAuth();
  const isFocused = useIsFocused();
  const { messages, loading, error, send, sending, markRead } = useDirectMessages(userId, isFocused);
  const { block } = useBlockUser(userId);
  const reportUser = useReportUser(userId, 'chat');
  const [text, setText] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const listRef = useRef<FlatList<DirectMessage>>(null);

  useEffect(() => {
    if (isFocused) markRead().catch(() => {});
  }, [isFocused, markRead, messages.length]);

  const handleSend = async () => {
    if (!text.trim()) return;
    const body = text;
    try {
      setText('');
      await send(body);
      listRef.current?.scrollToEnd({ animated: true });
    } catch (err: any) {
      setText(body);
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleBlock = () => {
    Alert.alert(t('social.blockTitle'), t('social.blockBody', { username }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('social.block'),
        style: 'destructive',
        onPress: () =>
          block()
            .then(() => navigation.goBack())
            .catch((err: any) => Alert.alert(t('common.error'), err.message)),
      },
    ]);
  };

  const handleReportSubmit = async (reason: string | null) => {
    try {
      await reportUser.mutateAsync(reason ?? undefined);
      Alert.alert(t('messages.reportThanks'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const handleMenu = () => {
    Alert.alert(t('messages.menuTitle'), undefined, [
      { text: t('comments.report'), onPress: () => setReportVisible(true) },
      { text: t('social.block'), style: 'destructive', onPress: handleBlock },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={10}
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>@{username}</Text>
        <TouchableOpacity
          onPress={handleMenu}
          style={styles.backButton}
          hitSlop={10}
          accessibilityLabel={t('common.more')}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.bright} />
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text variant="bodySM" color="bloodBright">
            {error}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.bloodBright} size="large" />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centered}>
          <Text variant="bodySM" color="muted">
            {t('messages.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isOwn = item.sender_id === session?.user.id;
            return (
              <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
                <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                  <Text variant="body" color="bright">
                    {item.body}
                  </Text>
                  <Text variant="monoSM" color="muted" style={styles.bubbleTime}>
                    {new Date(item.created_at).toLocaleTimeString(i18n.language, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.inputRow, { paddingBottom: insets.bottom || spacing.md }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('messages.placeholder')}
          placeholderTextColor={colors.faint}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={sending || !text.trim()}
          activeOpacity={0.8}
          accessibilityLabel={t('common.send')}
        >
          {sending ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Ionicons name="send" size={16} color={colors.onAccent} />
          )}
        </TouchableOpacity>
      </View>

      <ReportReasonModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={handleReportSubmit}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.bright,
    fontFamily: fontFamily.displayBold,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  errorBox: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bubbleOther: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
  },
  bubbleOwn: {
    backgroundColor: colors.blood,
    borderColor: colors.bloodBright,
  },
  bubbleTime: {
    marginTop: 4,
    alignSelf: 'flex-end',
    fontSize: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
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
