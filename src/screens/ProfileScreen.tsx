import { Button, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export default function ProfileScreen() {
  const { session } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Perfil</Text>
      <Text style={styles.email}>{session?.user.email}</Text>
      <View style={{ height: 20 }} />
      <Button title="Cerrar sesión" onPress={() => supabase.auth.signOut()} color="#dc2626" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 20 },
  text: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  email: { color: '#999', fontSize: 16 },
});