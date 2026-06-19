import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import MapScreen from '../screens/MapScreen';
import ConcertDetailScreen from '../screens/ConcertDetailScreen';
import FestivalDetailScreen from '../screens/FestivalDetailScreen';
import BandDetailScreen from '../screens/BandDetailScreen';
import { colors, fontFamily } from '../theme';

export type MapStackParamList = {
  MapHome: undefined;
  ConcertDetail: { concertId: string };
  FestivalDetail: { festivalId: string };
  BandDetail: { bandId: string };
};

const Stack = createNativeStackNavigator<MapStackParamList>();

export default function MapStack() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTitleStyle: {
          color: colors.bright,
          fontFamily: fontFamily.displayBold,
          fontSize: 16,
        },
        headerTintColor: colors.bright,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.ink },
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
      <Stack.Screen
        name="BandDetail"
        component={BandDetailScreen}
        options={{
          title: '',
          headerTransparent: true,
          headerBackVisible: true,
          headerTintColor: colors.bright,
        }}
      />
    </Stack.Navigator>
  );
}
