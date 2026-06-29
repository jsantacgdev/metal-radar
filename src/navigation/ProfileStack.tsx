import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import StatsDetailScreen, { StatsDetailParams } from '../screens/StatsDetailScreen';
import ConcertDetailScreen from '../screens/ConcertDetailScreen';
import FestivalDetailScreen from '../screens/FestivalDetailScreen';
import BandDetailScreen from '../screens/BandDetailScreen';
import PosterAdminScreen from '../screens/PosterAdminScreen';

export type ProfileStackParamList = {
  ProfileHome: undefined;
  Settings: undefined;
  DeleteAccount: undefined;
  StatsDetail: StatsDetailParams;
  ConcertDetail: { concertId: string };
  FestivalDetail: { festivalId: string };
  BandDetail: { bandId: string };
  PosterAdmin: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0c' },
        headerTintColor: '#fff',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: '',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{
          title: '',
          headerBackTitle: '',
        }}
      />
      <Stack.Screen
        name="StatsDetail"
        component={StatsDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ConcertDetail"
        component={ConcertDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FestivalDetail"
        component={FestivalDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BandDetail"
        component={BandDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PosterAdmin"
        component={PosterAdminScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
