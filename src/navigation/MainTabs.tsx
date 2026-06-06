import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
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

const Tab = createBottomTabNavigator<MainTabsParamList>();

const sharedHeader = {
  headerStyle: { backgroundColor: '#0a0a0a' },
  headerTitleStyle: { color: '#fff' },
};

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#222' },
        tabBarActiveTintColor: '#dc2626',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <Tab.Screen
        name="BandsTab"
        component={BandsScreen}
        options={{
          title: 'Bandas',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'musical-notes' : 'musical-notes-outline'}
              size={size}
              color={color}
            />
          ),
          headerShown: true,
          ...sharedHeader,
        }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapStack}
        options={{
          title: 'Mapa',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="DiaryTab"
        component={DiaryStack}
        options={{
          title: 'Diario',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'book' : 'book-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
          headerShown: true,
          ...sharedHeader,
        }}
      />
    </Tab.Navigator>
  );
}
