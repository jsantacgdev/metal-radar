import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import RadarScreen from '../screens/RadarScreen';
import BandDetailScreen from '../screens/BandDetailScreen';
import { colors, fontFamily } from '../theme';

export type RadarStackParamList = {
  RadarHome: undefined;
  BandDetail: { bandId: string };
};

const Stack = createNativeStackNavigator<RadarStackParamList>();

export default function RadarStack() {
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
        headerTintColor: colors.bloodBright,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="RadarHome" component={RadarScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="BandDetail"
        component={BandDetailScreen}
        options={{ title: t('navigation.band') }}
      />
    </Stack.Navigator>
  );
}
