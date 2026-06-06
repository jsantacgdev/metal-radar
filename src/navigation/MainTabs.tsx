import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import MapStack from './MapStack';
import DiaryStack from './DiaryStack';
import BandsScreen from '../screens/BandsScreen';
import ProfileScreen from '../screens/ProfileScreen';

export type MainTabsParamList = {
  MapTab: undefined;
  BandsTab: undefined;
  DiaryTab: undefined;
  Profile: undefined;
};

const Tab =
  createBottomTabNavigator<MainTabsParamList>();

const tabIcon = (emoji: string) => () => (
  <Text style={{ fontSize: 22 }}>{emoji}</Text>
);

const sharedHeader = {
  headerStyle: { backgroundColor: '#0a0a0a' },
  headerTitleStyle: { color: '#fff' },
};

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a0a',
          borderTopColor: '#222',
        },
        tabBarActiveTintColor: '#dc2626',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <Tab.Screen
        name="BandsTab"
        component={BandsScreen}
        options={{
          title: 'Bandas',
          tabBarIcon: tabIcon('🎸'),
          headerShown: true,
          ...sharedHeader,
        }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapStack}
        options={{
          title: 'Mapa',
          tabBarIcon: tabIcon('🗺️'),
        }}
      />
      <Tab.Screen
        name="DiaryTab"
        component={DiaryStack}
        options={{
          title: 'Diario',
          tabBarIcon: tabIcon('📖'),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          tabBarIcon: tabIcon('👤'),
          headerShown: true,
          ...sharedHeader,
        }}
      />
    </Tab.Navigator>
  );
}
