import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DiaryScreen from '../screens/DiaryScreen';
import ConcertDetailScreen from '../screens/ConcertDetailScreen';
import { Text as RNText } from 'react-native';
import { colors, fontFamily } from '../theme';

export type DiaryStackParamList = {
  DiaryHome: undefined;
  ConcertDetail: { concertId: string };
};

const Stack = createNativeStackNavigator<DiaryStackParamList>();

export default function DiaryStack() {
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
      <Stack.Screen name="DiaryHome" component={DiaryScreen} options={{ title: 'Diario' }} />
      <Stack.Screen
        name="ConcertDetail"
        component={ConcertDetailScreen}
        options={{ title: 'Concierto' }}
      />
    </Stack.Navigator>
  );
}
