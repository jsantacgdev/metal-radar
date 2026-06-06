import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MapScreen from '../screens/MapScreen';
import ConcertDetailScreen from '../screens/ConcertDetailScreen';

export type MapStackParamList = {
  MapHome: undefined;
  ConcertDetail: { concertId: string };
};

const Stack = createNativeStackNavigator<MapStackParamList>();

export default function MapStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTitleStyle: { color: '#fff' },
        headerTintColor: '#dc2626',
        contentStyle: { backgroundColor: '#0a0a0a' },
      }}
    >
      <Stack.Screen name="MapHome" component={MapScreen} options={{ title: 'Mapa' }} />
      <Stack.Screen
        name="ConcertDetail"
        component={ConcertDetailScreen}
        options={{ title: 'Concierto' }}
      />
    </Stack.Navigator>
  );
}
