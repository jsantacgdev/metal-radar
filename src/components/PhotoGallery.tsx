import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ConcertPhoto, useConcertPhotos } from '../hooks/useConcertPhotos';
import { useUploadConcertPhoto } from '../hooks/useUploadConcertPhoto';
import { useDeleteConcertPhoto } from '../hooks/useDeleteConcertPhoto';
import { FestivalPhoto, useFestivalPhotos } from '../hooks/useFestivalPhotos';
import { useUploadFestivalPhoto } from '../hooks/useUploadFestivalPhoto';
import { useDeleteFestivalPhoto } from '../hooks/useDeleteFestivalPhoto';
import { colors, radius, spacing } from '../theme';
import { Text } from './ui';

type Photo = ConcertPhoto | FestivalPhoto;

type Props =
  | { kind: 'concert'; userConcertId: string; userFestivalId?: never }
  | { kind: 'festival'; userFestivalId: string; userConcertId?: never };

const PHOTO_SIZE = 100;
const MAX_PHOTOS = 10;

export default function PhotoGallery(props: Props) {
  const { t } = useTranslation();
  const [viewing, setViewing] = useState<Photo | null>(null);

  // Concert hooks
  const concertPhotos = useConcertPhotos(props.kind === 'concert' ? props.userConcertId : null);
  const uploadConcert = useUploadConcertPhoto();
  const removeConcert = useDeleteConcertPhoto();

  // Festival hooks
  const festivalPhotos = useFestivalPhotos(props.kind === 'festival' ? props.userFestivalId : null);
  const uploadFestival = useUploadFestivalPhoto();
  const removeFestival = useDeleteFestivalPhoto();

  const photos: Photo[] =
    props.kind === 'concert' ? (concertPhotos.data ?? []) : (festivalPhotos.data ?? []);
  const isLoading = props.kind === 'concert' ? concertPhotos.isLoading : festivalPhotos.isLoading;
  const isUploading = props.kind === 'concert' ? uploadConcert.isPending : uploadFestival.isPending;

  const canAddMore = photos.length < MAX_PHOTOS;

  const handleAdd = () => {
    Alert.alert(t('photoGallery.addTitle'), t('photoGallery.addBody'), [
      {
        text: t('photoGallery.camera'),
        onPress: () => {
          if (props.kind === 'concert') {
            uploadConcert.mutate(
              { userConcertId: props.userConcertId, source: 'camera' },
              { onError: (e: Error) => Alert.alert(t('common.error'), e.message) },
            );
          } else {
            uploadFestival.mutate(
              { userFestivalId: props.userFestivalId, source: 'camera' },
              { onError: (e: Error) => Alert.alert(t('common.error'), e.message) },
            );
          }
        },
      },
      {
        text: t('photoGallery.library'),
        onPress: () => {
          if (props.kind === 'concert') {
            uploadConcert.mutate(
              { userConcertId: props.userConcertId, source: 'library' },
              { onError: (e: Error) => Alert.alert(t('common.error'), e.message) },
            );
          } else {
            uploadFestival.mutate(
              { userFestivalId: props.userFestivalId, source: 'library' },
              { onError: (e: Error) => Alert.alert(t('common.error'), e.message) },
            );
          }
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleDelete = (photo: Photo) => {
    Alert.alert(t('photoGallery.deleteTitle'), t('photoGallery.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          setViewing(null);
          if (props.kind === 'concert') {
            removeConcert.mutate({
              photoId: photo.id,
              storagePath: photo.storage_path,
              userConcertId: props.userConcertId,
            });
          } else {
            removeFestival.mutate({
              photoId: photo.id,
              storagePath: photo.storage_path,
              userFestivalId: props.userFestivalId,
            });
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text variant="monoMD" color="muted">
          {t('photoGallery.headerLabel', { count: photos.length, max: MAX_PHOTOS })}
        </Text>
        {isUploading && <ActivityIndicator size="small" color={colors.bloodBright} />}
      </View>

      {isLoading ? (
        <View style={styles.emptyBox}>
          <ActivityIndicator color={colors.bloodBright} />
        </View>
      ) : photos.length === 0 ? (
        <TouchableOpacity style={styles.emptyBox} onPress={handleAdd} activeOpacity={0.7}>
          <Ionicons name="camera-outline" size={28} color={colors.silver} />
          <Text variant="bodySM" color="silver" style={{ marginTop: spacing.sm }}>
            {t('photoGallery.emptyHint')}
          </Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          data={photos}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            canAddMore ? (
              <TouchableOpacity
                style={styles.addTile}
                onPress={handleAdd}
                activeOpacity={0.7}
                disabled={isUploading}
              >
                <Ionicons name="add" size={28} color={colors.silver} />
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setViewing(item)} activeOpacity={0.8}>
              <Image source={{ uri: item.signed_url }} style={styles.thumb} />
            </TouchableOpacity>
          )}
        />
      )}

      <Modal
        visible={!!viewing}
        transparent
        animationType="fade"
        onRequestClose={() => setViewing(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setViewing(null)} />
          {viewing && (
            <>
              <Image
                source={{ uri: viewing.signed_url }}
                style={styles.fullImage}
                resizeMode="contain"
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtn} onPress={() => handleDelete(viewing)}>
                  <Ionicons name="trash-outline" size={22} color={colors.bloodBright} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtn} onPress={() => setViewing(null)}>
                  <Ionicons name="close" size={22} color={colors.bright} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyBox: {
    height: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: spacing.sm,
  },
  thumb: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.sm,
    backgroundColor: colors.panel2,
  },
  addTile: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
  modalActions: {
    position: 'absolute',
    top: 50,
    right: 20,
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
