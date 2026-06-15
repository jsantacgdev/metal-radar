import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '../components/ui';
import { useDeleteAccount } from '../hooks/useDeleteAccount';
import { useAuth } from '../hooks/useAuth';
import { colors, fontFamily, radius, spacing } from '../theme';

export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { session } = useAuth();
  const deleteAccount = useDeleteAccount();

  const [confirmText, setConfirmText] = useState('');

  const CONFIRM_KEYWORD = t('deleteAccount.confirmKeyword');
  const isConfirmed = confirmText.trim().toUpperCase() === CONFIRM_KEYWORD.toUpperCase();

  const handleDelete = () => {
    Alert.alert(t('deleteAccount.finalAlertTitle'), t('deleteAccount.finalAlertBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('deleteAccount.finalAlertConfirm'),
        style: 'destructive',
        onPress: () => {
          deleteAccount.mutate(undefined, {
            onError: (err: any) => {
              Alert.alert(t('common.error'), err.message);
            },
          });
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
    >
      <View style={styles.iconWrapper}>
        <Ionicons name="warning" size={48} color={colors.bloodBright} />
      </View>

      <Text variant="displayLG" style={styles.title}>
        {t('deleteAccount.title')}
      </Text>

      <Text variant="body" color="silver" style={styles.intro}>
        {t('deleteAccount.intro', { email: session?.user.email ?? '' })}
      </Text>

      <View style={styles.warningCard}>
        <Text variant="monoMD" color="bloodBright" style={{ marginBottom: spacing.md }}>
          {t('deleteAccount.whatGetsDeletedTitle')}
        </Text>
        <BulletItem text={t('deleteAccount.bulletProfile')} />
        <BulletItem text={t('deleteAccount.bulletFollowedBands')} />
        <BulletItem text={t('deleteAccount.bulletConcerts')} />
        <BulletItem text={t('deleteAccount.bulletDiary')} />
        <BulletItem text={t('deleteAccount.bulletPhotos')} />
        <BulletItem text={t('deleteAccount.bulletPreferences')} />
      </View>

      <Text variant="bodySM" color="muted" style={styles.warningText}>
        {t('deleteAccount.irreversibleWarning')}
      </Text>

      <View style={styles.confirmSection}>
        <Text variant="monoMD" color="muted" style={{ marginBottom: spacing.sm }}>
          {t('deleteAccount.confirmInstruction', { keyword: CONFIRM_KEYWORD })}
        </Text>

        <TextInput
          style={[styles.input, isConfirmed && { borderColor: colors.bloodBright }]}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={CONFIRM_KEYWORD}
          placeholderTextColor={colors.faint}
        />
      </View>

      <Button
        label={t('deleteAccount.deleteButton')}
        onPress={handleDelete}
        loading={deleteAccount.isPending}
        disabled={!isConfirmed || deleteAccount.isPending}
        variant="primary"
        icon={<Ionicons name="trash" size={18} color="#fff" />}
        style={!isConfirmed ? { opacity: 0.5 } : undefined}
      />

      <View style={{ height: spacing.md }} />

      <Button label={t('common.cancel')} variant="ghost" onPress={() => navigation.goBack()} />
    </ScrollView>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={{ color: colors.bloodBright, marginRight: spacing.sm }}>•</Text>
      <Text variant="body" color="silver" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  intro: {
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  warningCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  warningText: {
    textAlign: 'center',
    marginBottom: spacing.xl,
    fontStyle: 'italic',
  },
  confirmSection: {
    marginBottom: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.bright,
    fontFamily: fontFamily.mono,
    fontSize: 16,
    letterSpacing: 2,
    backgroundColor: colors.panel,
    textAlign: 'center',
  },
});
