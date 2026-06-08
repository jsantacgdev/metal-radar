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

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      return Alert.alert('Faltan datos', 'Introduce email y contraseña');
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
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
      <View style={styles.brand}>
        <Ionicons name="radio" size={28} color={colors.bloodBright} />
        <Text variant="monoMD" color="bloodBright" style={{ marginTop: spacing.md }}>
          METAL RADAR
        </Text>
        <Text variant="displayXL" style={styles.title}>
          Inicia{'\n'}sesión
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
            CONTRASEÑA
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

        <Button label="Entrar" onPress={handleLogin} loading={loading} />

        <TouchableOpacity style={styles.switchLink} onPress={() => navigation.navigate('Register')}>
          <Text variant="monoMD" color="muted">
            ¿NO TIENES CUENTA?{' '}
          </Text>
          <Text variant="monoMD" color="bloodBright">
            REGÍSTRATE
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
