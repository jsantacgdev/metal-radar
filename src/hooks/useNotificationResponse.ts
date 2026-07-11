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

    const navigateForData = (data: any) => {
      if (!data) return;

      if (data.kind === 'follow_request') {
        navigation.navigate('Profile', { screen: 'FollowRequests' });
        return;
      }
      if (data.kind === 'new_follower' && data.userId) {
        navigation.navigate('Profile', { screen: 'PublicProfile', params: { userId: data.userId } });
        return;
      }
      if (data.kind === 'comment_reply') {
        if (data.concertId) {
          navigation.navigate('MapTab', { screen: 'ConcertDetail', params: { concertId: data.concertId } });
        } else if (data.festivalId) {
          navigation.navigate('MapTab', {
            screen: 'FestivalDetail',
            params: { festivalId: data.festivalId },
          });
        }
        return;
      }
      if (data.concertId) {
        navigation.navigate('MapTab', {
          screen: 'ConcertDetail',
          params: { concertId: data.concertId },
        });
      }
    };

    (async () => {
      try {
        const Notifications = await import('expo-notifications');

        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          navigateForData(response.notification.request.content.data);
        });

        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse && !cancelled) {
          navigateForData(lastResponse.notification.request.content.data);
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
