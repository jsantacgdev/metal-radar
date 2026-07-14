import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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
import { privacyUrl, termsUrl } from '../../lib/legalUrls';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormErrors = {
  displayName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export default function RegisterScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const clearError = (field: keyof FormErrors) => {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const next: FormErrors = {};
    if (!displayName.trim()) next.displayName = t('register.errorNameRequired');
    if (!email.trim()) next.email = t('register.errorEmailRequired');
    else if (!EMAIL_RE.test(email.trim())) next.email = t('register.errorEmailInvalid');
    if (!password) next.password = t('register.errorPasswordRequired');
    else if (password.length < 6) next.password = t('register.shortPasswordBody');
    if (confirmPassword !== password) next.confirmPassword = t('register.errorPasswordMismatch');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleRegister = async () => {
    setFormError(null);
    if (!validate()) return;
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName.trim(),
          },
        },
      });
      if (error) {
        setFormError(error.message);
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        accessibilityLabel={t('common.back')}
      >
        <Ionicons name="chevron-back" size={24} color={colors.bright} />
      </TouchableOpacity>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <Ionicons name="radio" size={28} color={colors.bloodBright} />
            <Text variant="monoMD" color="bloodBright" style={{ marginTop: spacing.md }}>
              {t('register.brand')}
            </Text>
            <Text variant="displayXL" style={styles.title}>
              {t('register.title')}
            </Text>
          </View>

          <View style={styles.form}>
            {formError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.bloodBright} />
                <Text variant="bodySM" color="bloodBright" style={{ marginLeft: spacing.sm, flex: 1 }}>
                  {formError}
                </Text>
              </View>
            )}

            <FormField
              label={t('register.nameLabel')}
              placeholder={t('register.namePlaceholder')}
              value={displayName}
              onChangeText={(text) => {
                setDisplayName(text);
                clearError('displayName');
              }}
              error={errors.displayName}
              autoCapitalize="words"
              returnKeyType="next"
              maxLength={40}
            />

            <FormField
              label={t('register.emailLabel')}
              placeholder={t('register.emailPlaceholder')}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                clearError('email');
              }}
              error={errors.email}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
            />

            <FormField
              label={t('register.passwordLabel')}
              placeholder="••••••••"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                clearError('password');
              }}
              error={errors.password}
              isPassword
              autoCapitalize="none"
              returnKeyType="next"
            />

            <FormField
              label={t('register.confirmPasswordLabel')}
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                clearError('confirmPassword');
              }}
              error={errors.confirmPassword}
              isPassword
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleRegister}
            />

            <View style={styles.legalNotice}>
              <Text variant="bodySM" color="muted" style={{ textAlign: 'center', lineHeight: 18 }}>
                {t('register.legalPrefix')}{' '}
                <Text
                  variant="bodySM"
                  color="bloodBright"
                  onPress={() => Linking.openURL(privacyUrl(i18n.language))}
                >
                  {t('register.legalPrivacy')}
                </Text>{' '}
                {t('register.legalAnd')}{' '}
                <Text
                  variant="bodySM"
                  color="bloodBright"
                  onPress={() => Linking.openURL(termsUrl(i18n.language))}
                >
                  {t('register.legalTerms')}
                </Text>
                {t('register.legalSuffix')}
              </Text>
            </View>

            <Button label={t('register.submit')} onPress={handleRegister} loading={loading} />

            <TouchableOpacity style={styles.switchLink} onPress={() => navigation.goBack()}>
              <Text variant="monoMD" color="muted">
                {t('register.alreadyHaveAccount')}{' '}
              </Text>
              <Text variant="monoMD" color="bloodBright">
                {t('register.signInCta')}
              </Text>
            </TouchableOpacity>
          </View>
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
    marginBottom: spacing.xxxl + spacing.sm,
  },
  title: {
    marginTop: spacing.lg,
  },
  form: {
    gap: spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bloodTint,
    borderWidth: 1,
    borderColor: colors.bloodTintBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  switchLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  legalNotice: {
    paddingHorizontal: spacing.md,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
});
