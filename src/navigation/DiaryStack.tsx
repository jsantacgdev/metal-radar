import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text as RNText } from 'react-native';
import { useTranslation } from 'react-i18next';
import DiaryScreen from '../screens/DiaryScreen';
import ConcertDetailScreen from '../screens/ConcertDetailScreen';
import FestivalDetailScreen from '../screens/FestivalDetailScreen';
import BandDetailScreen from '../screens/BandDetailScreen';
import { colors, fontFamily } from '../theme';

export type DiaryStackParamList = {
  DiaryHome: undefined;
  ConcertDetail: { concertId: string };
  FestivalDetail: { festivalId: string };
  BandDetail: { bandId: string };
};

const Stack = createNativeStackNavigator<DiaryStackParamList>();

export default function DiaryStack() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTitle: ({ children }) => (
          <RNText
            style={{
              color: colors.bright,
              fontFamily: fontFamily.displayBold,
              fontSize: 16,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {children}
          </RNText>
        ),
        headerTintColor: colors.bloodBright,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen
        name="DiaryHome"
        component={DiaryScreen}
        options={{ title: t('navigation.diary'), headerTitle: '', headerShown: false }}
      />
      <Stack.Screen
        name="ConcertDetail"
        component={ConcertDetailScreen}
        options={{ title: t('navigation.concert') }}
      />
      <Stack.Screen
        name="FestivalDetail"
        component={FestivalDetailScreen}
        options={{ title: '' }}
      />
      <Stack.Screen
        name="BandDetail"
        component={BandDetailScreen}
        options={{ title: t('navigation.band') }}
      />
    </Stack.Navigator>
  );
}
