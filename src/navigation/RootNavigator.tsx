import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import AuthNavigator from './AuthNavigator';
import MainTabs from './MainTabs';
import OnboardingScreen from '../screens/OnboardingScreen';
import { colors } from '../theme';

export default function RootNavigator() {
  const { session, loading, hasOnboarded, refreshOnboarding } = useAuth();

  if (loading || (session && hasOnboarded === null)) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.ink,
        }}
      >
        <ActivityIndicator color={colors.bloodBright} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={DarkTheme}>
      {!session ? (
        <AuthNavigator />
      ) : hasOnboarded === false ? (
        <OnboardingScreen onDone={refreshOnboarding} />
      ) : (
        <MainTabs />
      )}
    </NavigationContainer>
  );
}
