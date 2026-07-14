import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import FestivalPoster from '../components/FestivalPoster';
import { usePosterData } from '../hooks/usePosterData';
import { useAuth } from '../hooks/useAuth';
import { getPosterYear } from '../lib/wrappedAvailability';
import { colors, fontFamily, radius, spacing } from '../theme';
import { Text } from '../components/ui';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PosterScreen() {
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { session } = useAuth();

  const year = getPosterYear();
  const { data, loading } = usePosterData(year);

  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const userName = session?.user.email?.split('@')[0] ?? '';

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = String(q.queryKey[0] ?? '');
          return (
            key.includes('profileStats') ||
            key.includes('userConcerts') ||
            key.includes('user-concerts') ||
            key.includes('concerts')
          );
        },
      });
    }, [queryClient]),
  );

  const handleShare = async () => {
    if (!viewShotRef.current) return;
    try {
      setSharing(true);
      const uri = await viewShotRef.current.capture!();
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(t('common.error'), t('poster.shareNotAvailable'));
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: t('poster.shareDialogTitle'),
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.ink }]}>
        <ActivityIndicator color={colors.bloodBright} size="large" />
      </View>
    );
  }

  if (!data.hasEnoughData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={10}
          >
            <Ionicons name="arrow-back" size={22} color={colors.bright} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Ionicons name="musical-notes-outline" size={48} color={colors.faint} />
          <Text variant="displaySM" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
            {t('poster.notEnoughDataTitle')}
          </Text>
          <Text variant="body" color="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            {t('poster.notEnoughDataDesc')}
          </Text>
        </View>
      </View>
    );
  }

  const POSTER_NATIVE_WIDTH = 1080;
  const previewWidth = SCREEN_WIDTH - spacing.xl * 2;
  const scale = previewWidth / POSTER_NATIVE_WIDTH;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={10}
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('poster.title', { year: data.year })}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xxxl + 80,
          alignItems: 'center',
        }}
      >
        {/* Poster real (renderizado fuera de pantalla para capture, no se ve) */}
        <View style={styles.offscreen}>
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.95, result: 'tmpfile' }}>
            <FestivalPoster data={data} userName={userName} />
          </ViewShot>
        </View>

        {/* Preview escalado para mostrar al usuario */}
        <View
          style={[
            styles.previewWrapper,
            {
              width: previewWidth,
              height: previewWidth * (16 / 9),
            },
          ]}
        >
          <View
            style={{
              width: POSTER_NATIVE_WIDTH,
              transform: [{ scale }],
              transformOrigin: 'top left' as any,
            }}
          >
            <FestivalPoster data={data} userName={userName} />
          </View>
        </View>
      </ScrollView>

      {/* FAB flotante de compartir */}
      <TouchableOpacity
        style={[
          styles.fabShare,
          {
            bottom: insets.bottom + spacing.xl,
            opacity: sharing ? 0.7 : 1,
          },
        ]}
        onPress={handleShare}
        disabled={sharing}
        activeOpacity={0.85}
      >
        {sharing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="share-social" size={18} color="#fff" />
            <Text style={styles.fabShareText}>{t('poster.shareButton')}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.bright,
    fontFamily: fontFamily.displayBold,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  previewWrapper: {
    marginTop: spacing.lg,
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },

  fabShare: {
    position: 'absolute',
    right: spacing.xl,
    height: 52,
    paddingHorizontal: 22,
    borderRadius: 26,
    backgroundColor: colors.blood,
    borderWidth: 2,
    borderColor: colors.bloodBright,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,

    shadowColor: colors.blood,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,

    elevation: 8,
  },
  fabShareText: {
    fontFamily: fontFamily.displayBold,
    fontSize: 13,
    color: '#fff',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
