import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

export function useNotificationResponse() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    if (isExpoGo) return;

    let subscription: any;
    let cancelled = false;

    (async () => {
      try {
        const Notifications = await import('expo-notifications');

        // Manejar tap cuando la app está cerrada o en background
        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data;
          if (data?.concertId) {
            navigation.navigate('MapTab', {
              screen: 'ConcertDetail',
              params: { concertId: data.concertId },
            });
          }
        });

        // Manejar caso de app abierta desde notificación (cold start)
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse && !cancelled) {
          const data = lastResponse.notification.request.content.data;
          if (data?.concertId) {
            navigation.navigate('MapTab', {
              screen: 'ConcertDetail',
              params: { concertId: data.concertId },
            });
          }
        }
      } catch (err) {
        console.warn('Error setting up notification listener:', err);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [navigation]);
}
