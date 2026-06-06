import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import MapScreen from '../screens/MapScreen';
import DiaryScreen from '../screens/DiaryScreen';
import ProfileScreen from '../screens/ProfileScreen';

export type MainTabsParamList = {
  Map: undefined;
  Diary: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

// Iconos provisionales con emoji para evitar instalar otra librería ahora
const tabIcon = (emoji: string) => () => <Text style={{ fontSize: 22 }}>{emoji}</Text>;

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTitleStyle: { color: '#fff' },
        tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#222' },
        tabBarActiveTintColor: '#dc2626',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Mapa', tabBarIcon: tabIcon('🗺️') }} />
      <Tab.Screen name="Diary" component={DiaryScreen} options={{ title: 'Diario', tabBarIcon: tabIcon('📖') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil', tabBarIcon: tabIcon('👤') }} />
    </Tab.Navigator>
  );
}