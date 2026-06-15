import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen from '../screens/ProfileScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';

export type ProfileStackParamList = {
  ProfileHome: undefined;
  DeleteAccount: undefined;
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
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{
          title: '',
          headerBackTitle: '',
        }}
      />
    </Stack.Navigator>
  );
}
