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
import { useNavigation } from '@react-navigation/native';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PosterScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { session } = useAuth();

  const year = getPosterYear();
  const { data, loading } = usePosterData(year);

  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  // Nombre derivado del email (parte antes del @)
  const userName = session?.user.email?.split('@')[0] ?? '';

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

  // Preview escalado del poster
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
        >
          <Ionicons name="arrow-back" size={22} color={colors.bright} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('poster.title', { year: data.year })}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xxxl,
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

        {/* Botón compartir */}
        <TouchableOpacity
          style={[styles.shareButton, sharing && { opacity: 0.7 }]}
          onPress={handleShare}
          disabled={sharing}
          activeOpacity={0.85}
        >
          {sharing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="share-social" size={20} color="#fff" />
              <Text
                style={{
                  fontFamily: fontFamily.displayBold,
                  fontSize: 15,
                  color: '#fff',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  marginLeft: spacing.sm,
                }}
              >
                {t('poster.shareButton')}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text variant="bodySM" color="muted" style={{ marginTop: spacing.md, textAlign: 'center' }}>
          {t('poster.shareHint')}
        </Text>
      </ScrollView>
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
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blood,
    borderWidth: 1,
    borderColor: colors.bloodBright,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xl,
    minWidth: 200,
  },
});
