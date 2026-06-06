import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DiaryScreen from '../screens/DiaryScreen';
import ConcertDetailScreen from '../screens/ConcertDetailScreen';

export type DiaryStackParamList = {
  DiaryHome: undefined;
  ConcertDetail: { concertId: string };
};

const Stack = createNativeStackNavigator<DiaryStackParamList>();

export default function DiaryStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTitleStyle: { color: '#fff' },
        headerTintColor: '#dc2626',
        contentStyle: { backgroundColor: '#0a0a0a' },
      }}
    >
      <Stack.Screen name="DiaryHome" component={DiaryScreen} options={{ title: 'Diario' }} />
      <Stack.Screen
        name="ConcertDetail"
        component={ConcertDetailScreen}
        options={{ title: 'Concierto' }}
      />
    </Stack.Navigator>
  );
}
