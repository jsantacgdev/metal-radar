import { createNativeStackNavigator } from '@react-navigation/native-stack';
import FeedScreen from '../screens/FeedScreen';
import ConcertDetailScreen from '../screens/ConcertDetailScreen';
import FestivalDetailScreen from '../screens/FestivalDetailScreen';
import BandDetailScreen from '../screens/BandDetailScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import WhoIsGoingScreen from '../screens/WhoIsGoingScreen';
import UserSearchScreen from '../screens/UserSearchScreen';
import ChatScreen from '../screens/ChatScreen';
import { colors, fontFamily } from '../theme';

export type FeedStackParamList = {
  FeedHome: undefined;
  ConcertDetail: { concertId: string };
  FestivalDetail: { festivalId: string };
  BandDetail: { bandId: string };
  PublicProfile: { userId: string };
  WhoIsGoing: { targetType: 'concert' | 'festival'; targetId: string };
  UserSearch: undefined;
  Chat: { userId: string; username: string | null };
};

const Stack = createNativeStackNavigator<FeedStackParamList>();

export default function FeedStack() {
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
      <Stack.Screen name="FeedHome" component={FeedScreen} options={{ headerShown: false }} />
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
        name="PublicProfile"
        component={PublicProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WhoIsGoing"
        component={WhoIsGoingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="UserSearch"
        component={UserSearchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
