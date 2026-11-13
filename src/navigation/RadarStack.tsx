import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RadarScreen from '../screens/RadarScreen';
import BandDetailScreen from '../screens/BandDetailScreen';
import { colors, fontFamily } from '../theme';

export type RadarStackParamList = {
  RadarHome: undefined;
  BandDetail: { bandId: string };
};

const Stack = createNativeStackNavigator<RadarStackParamList>();

export default function RadarStack() {

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTitleStyle: {
          color: colors.bright,
          fontFamily: fontFamily.displayBold,
          fontSize: 16,
        },
        headerTintColor: colors.bloodBright,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="RadarHome" component={RadarScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="BandDetail"
        component={BandDetailScreen}
        options={{
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}
