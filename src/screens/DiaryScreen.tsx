import { StyleSheet, Text, View } from 'react-native';

export default function DiaryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Diario de conciertos</Text>
      <Text style={styles.subtext}>Próximamente</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  text: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  subtext: { color: '#666', marginTop: 8 },
});