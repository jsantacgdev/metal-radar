import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import RadarStack from './RadarStack';
import MapStack from './MapStack';
import DiaryStack from './DiaryStack';
import ProfileScreen from '../screens/ProfileScreen';
import { colors, fontFamily } from '../theme';
import { useNotificationResponse } from '../hooks/useNotificationResponse';

export type MainTabsParamList = {
  Radar: undefined;
  MapTab: undefined;
  DiaryTab: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export default function MainTabs() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  useNotificationResponse();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 60 + insets.bottom,
            paddingBottom: insets.bottom,
          },
        ],
        tabBarActiveTintColor: colors.bloodBright,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: { paddingVertical: 6 },
      }}
    >
      <Tab.Screen
        name="Radar"
        component={RadarStack}
        options={{
          title: t('navigation.tabRadar'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'radio' : 'radio-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapStack}
        options={{
          title: t('navigation.tabMap'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'location' : 'location-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="DiaryTab"
        component={DiaryStack}
        options={{
          title: t('navigation.tabDiary'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: t('navigation.tabProfile'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
          headerShown: false,
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
  },
  tabLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
