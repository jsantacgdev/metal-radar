import { useFonts } from 'expo-font';
import { Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/lib/queryClient';
import { colors } from './src/theme';
import RootNavigator from './src/navigation/RootNavigator';
import { initI18n } from './src/i18n';
import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/react-native';
import { supabase } from './src/lib/supabase';
import { checkNotificationPermissions, registerForPushNotifications } from './src/lib/notifications';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import { Oswald_400Regular, Oswald_500Medium } from '@expo-google-fonts/oswald';
import { SpecialElite_400Regular } from '@expo-google-fonts/special-elite';
import { UnifrakturMaguntia_400Regular } from '@expo-google-fonts/unifrakturmaguntia';
import { Cinzel_400Regular, Cinzel_600SemiBold, Cinzel_900Black } from '@expo-google-fonts/cinzel';

Sentry.init({
  dsn: 'https://0aefe0af13aade1127859877797d6beb@o4511571709984768.ingest.de.sentry.io/4511571712999504',

  sendDefaultPii: false,

  enabled: !__DEV__,

  beforeSend(event) {
    if (event.user) {
      delete event.user.ip_address;
      delete event.user.email;
      delete event.user.username;
    }
    return event;
  },

  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
      if (breadcrumb.data) {
        delete breadcrumb.data.request_body;
        delete breadcrumb.data.response_body;
      }
    }
    return breadcrumb;
  },
});

export default Sentry.wrap(function App() {
  const [fontsLoaded] = useFonts({
    Archivo_700Bold,
    Archivo_800ExtraBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    BebasNeue_400Regular,
    Anton_400Regular,
    Oswald_400Regular,
    Oswald_500Medium,
    SpecialElite_400Regular,
    UnifrakturMaguntia_400Regular,
    Cinzel_400Regular,
    Cinzel_600SemiBold,
    Cinzel_900Black,
    MetalLord: require('./assets/fonts/MetalLord.otf'),
  });

  const [ready, setReady] = useState(false);

  useEffect(() => {
    initI18n().then(() => setReady(true));
  }, []);

  useEffect(() => {
    const updateSentryUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        Sentry.setUser({ id: user.id });
      } else {
        Sentry.setUser(null);
      }
    };

    updateSentryUser();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        Sentry.setUser({ id: session.user.id });
      } else {
        Sentry.setUser(null);
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // El permiso del sistema puede seguir "concedido" mientras el token
    // guardado en `profiles.push_token` ya no es válido para FCM (p. ej.
    // tras reinstalar la app) — la UI de Ajustes solo deja re-registrar
    // a mano cuando detecta que NO hay token guardado, así que sin esto
    // un token obsoleto se queda así para siempre. Refrescarlo en cada
    // arranque/login (sin pedir permiso si no lo tenía ya concedido) lo
    // mantiene al día solo.
    const refreshPushTokenIfGranted = async () => {
      const status = await checkNotificationPermissions();
      if (status === 'granted') {
        registerForPushNotifications();
      }
    };

    refreshPushTokenIfGranted();

    const { data: pushSubscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') refreshPushTokenIfGranted();
    });

    return () => {
      pushSubscription.subscription.unsubscribe();
    };
  }, []);

  if (!fontsLoaded || !ready) {
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
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <RootNavigator />
        <StatusBar style="light" backgroundColor={colors.ink} translucent={false} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
});
