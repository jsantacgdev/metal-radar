import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import AuthNavigator from './AuthNavigator';
import MainTabs from './MainTabs';
import OnboardingScreen from '../screens/OnboardingScreen';

export default function RootNavigator() {
  const { session, loading, hasOnboarded, refreshOnboarding } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' }}>
        <ActivityIndicator color="#dc2626" size="large" />
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