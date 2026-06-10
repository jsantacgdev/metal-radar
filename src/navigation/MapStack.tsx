import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MapScreen from '../screens/MapScreen';
import ConcertDetailScreen from '../screens/ConcertDetailScreen';
import FestivalDetailScreen from '../screens/FestivalDetailScreen';
import { colors } from '../theme';

export type MapStackParamList = {
  MapHome: undefined;
  ConcertDetail: { concertId: string };
  FestivalDetail: { festivalId: string };
};

const Stack = createNativeStackNavigator<MapStackParamList>();

export default function MapStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.bright,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="MapHome" component={MapScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ConcertDetail"
        component={ConcertDetailScreen}
        options={{ headerTitle: '' }}
      />
      <Stack.Screen
        name="FestivalDetail"
        component={FestivalDetailScreen}
        options={{ headerTitle: '' }}
      />
    </Stack.Navigator>
  );
}
