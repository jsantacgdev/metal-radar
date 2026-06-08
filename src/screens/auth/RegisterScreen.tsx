import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { colors, fontFamily, radius, spacing } from '../../theme';
import { Button, Text } from '../../components/ui';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password) {
      return Alert.alert('Faltan datos', 'Introduce email y contraseña');
    }
    if (password.length < 6) {
      return Alert.alert('Contraseña corta', 'Mínimo 6 caracteres');
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={24} color={colors.bright} />
      </TouchableOpacity>

      <View style={styles.brand}>
        <Ionicons name="radio" size={28} color={colors.bloodBright} />
        <Text variant="monoMD" color="bloodBright" style={{ marginTop: spacing.md }}>
          METAL RADAR
        </Text>
        <Text variant="displayXL" style={styles.title}>
          Crea{'\n'}tu cuenta
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.fieldGroup}>
          <Text variant="monoSM" color="muted" style={styles.label}>
            EMAIL
          </Text>
          <TextInput
            style={styles.input}
            placeholder="tu@correo.com"
            placeholderTextColor={colors.faint}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text variant="monoSM" color="muted" style={styles.label}>
            CONTRASEÑA · MÍN. 6 CARACTERES
          </Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.faint}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <Button label="Crear cuenta" onPress={handleRegister} loading={loading} />

        <TouchableOpacity style={styles.switchLink} onPress={() => navigation.goBack()}>
          <Text variant="monoMD" color="muted">
            ¿YA TIENES CUENTA?{' '}
          </Text>
          <Text variant="monoMD" color="bloodBright">
            INICIA SESIÓN
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
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
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    paddingLeft: spacing.xs,
  },
  input: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontSize: 16,
    color: colors.bright,
    fontFamily: fontFamily.body,
  },
  switchLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
});
