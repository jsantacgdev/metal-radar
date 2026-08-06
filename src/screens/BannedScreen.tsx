import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { colors, spacing } from '../theme';
import { Button, Text } from '../components/ui';
import { localeFromI18n } from '../i18n';

export default function BannedScreen({ bannedUntil }: { bannedUntil: string | null }) {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = localeFromI18n(i18n.language);

  // ban_duration = "87600h" (10 años) para "permanente" en moderate-user —
  // más de 5 años de plazo se trata como indefinido de cara al mensaje.
  const isPermanent =
    !bannedUntil || new Date(bannedUntil).getFullYear() - new Date().getFullYear() >= 5;

  const untilStr = bannedUntil
    ? new Date(bannedUntil).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.iconCircle}>
        <Ionicons name="ban" size={32} color={colors.bloodBright} />
      </View>
      <Text variant="displayLG" style={{ marginTop: spacing.xl, textAlign: 'center' }}>
        {t('banned.title')}
      </Text>
      <Text variant="body" color="muted" style={{ marginTop: spacing.md, textAlign: 'center' }}>
        {isPermanent ? t('banned.messagePermanent') : t('banned.messageTemporary', { date: untilStr })}
      </Text>
      <Button
        label={t('auth.signOut')}
        variant="secondary"
        onPress={() => supabase.auth.signOut()}
        style={{ marginTop: spacing.xxxl }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
