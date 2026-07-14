import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { colors, radius, spacing } from '../../theme';
import { Button, FormField, Text } from '../../components/ui';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError(t('login.errorEmailRequired'));
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError(t('login.errorEmailInvalid'));
      return;
    }
    setError(null);
    try {
      setLoading(true);
      // No lanzamos si falla: no queremos confirmar/desmentir si un email
      // existe o no en el sistema (evita enumeración de cuentas).
      await supabase.auth.resetPasswordForEmail(email.trim());
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={24} color={colors.bright} />
      </TouchableOpacity>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {sent ? (
            <View style={styles.sentBlock}>
              <View style={styles.sentIconCircle}>
                <Ionicons name="mail-outline" size={32} color={colors.bloodBright} />
              </View>
              <Text variant="displayLG" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
                {t('forgotPassword.sentTitle')}
              </Text>
              <Text
                variant="body"
                color="muted"
                style={{ marginTop: spacing.sm, textAlign: 'center' }}
              >
                {t('forgotPassword.sentBody', { email: email.trim() })}
              </Text>
              <View style={{ marginTop: spacing.xxl, width: '100%' }}>
                <Button
                  label={t('forgotPassword.backToLogin')}
                  variant="secondary"
                  onPress={() => navigation.navigate('Login')}
                />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.brand}>
                <Ionicons name="key-outline" size={28} color={colors.bloodBright} />
                <Text variant="displayXL" style={styles.title}>
                  {t('forgotPassword.title')}
                </Text>
                <Text variant="body" color="muted" style={{ marginTop: spacing.sm }}>
                  {t('forgotPassword.subtitle')}
                </Text>
              </View>

              <View style={styles.form}>
                <FormField
                  label={t('login.emailLabel')}
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) setError(null);
                  }}
                  error={error}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  autoFocus
                />

                <Button
                  label={t('forgotPassword.submit')}
                  onPress={handleSubmit}
                  loading={loading}
                />
              </View>
            </>
          )}
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xxl,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  brand: {
    alignItems: 'flex-start',
    marginBottom: spacing.xxxl,
  },
  title: {
    marginTop: spacing.lg,
  },
  form: {
    gap: spacing.lg,
  },
  sentBlock: {
    alignItems: 'center',
  },
  sentIconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
