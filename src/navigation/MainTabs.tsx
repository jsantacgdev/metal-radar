import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import MapStack from './MapStack';
import DiaryStack from './DiaryStack';
import BandsScreen from '../screens/BandsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors, fontFamily } from '../theme';

export type MainTabsParamList = {
  MapTab: undefined;
  BandsTab: undefined;
  DiaryTab: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const sharedHeader = {
  headerStyle: { backgroundColor: colors.ink },
  headerTitleStyle: {
    color: colors.bright,
    fontFamily: fontFamily.displayBold,
    fontSize: 18,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  headerShadowVisible: false,
};

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.bloodBright,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: { paddingVertical: 6 },
      }}
    >
      <Tab.Screen
        name="BandsTab"
        component={BandsScreen}
        options={{
          title: 'Bandas',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'musical-notes' : 'musical-notes-outline'}
              size={22}
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
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'location' : 'location-outline'} size={22} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="DiaryTab"
        component={DiaryStack}
        options={{
          title: 'Diario',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
          headerShown: true,
          ...sharedHeader,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.ink,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    height: 72,
    paddingTop: 4,
  },
  tabLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
