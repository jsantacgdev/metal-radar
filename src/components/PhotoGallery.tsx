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
import { ConcertPhoto, useConcertPhotos } from '../hooks/useConcertPhotos';
import { useUploadConcertPhoto } from '../hooks/useUploadConcertPhoto';
import { useDeleteConcertPhoto } from '../hooks/useDeleteConcertPhoto';
import { colors, radius, spacing } from '../theme';
import { Text } from './ui';

type Props = {
  userConcertId: string;
};

const PHOTO_SIZE = 100;
const MAX_PHOTOS = 10;

export default function PhotoGallery({ userConcertId }: Props) {
  const { data: photos = [], isLoading } = useConcertPhotos(userConcertId);
  const upload = useUploadConcertPhoto();
  const remove = useDeleteConcertPhoto();
  const [viewing, setViewing] = useState<ConcertPhoto | null>(null);

  const canAddMore = photos.length < MAX_PHOTOS;

  const handleAdd = () => {
    Alert.alert('Añadir foto', '¿Cómo quieres añadirla?', [
      {
        text: 'Cámara',
        onPress: () =>
          upload.mutate(
            { userConcertId, source: 'camera' },
            { onError: (e: Error) => Alert.alert('Error', e.message) },
          ),
      },
      {
        text: 'Galería',
        onPress: () =>
          upload.mutate(
            { userConcertId, source: 'library' },
            { onError: (e: Error) => Alert.alert('Error', e.message) },
          ),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleDelete = (photo: ConcertPhoto) => {
    Alert.alert('Borrar foto', '¿Seguro que quieres borrarla?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          setViewing(null);
          remove.mutate({
            photoId: photo.id,
            storagePath: photo.storage_path,
            userConcertId,
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text variant="monoMD" color="muted">
          FOTOS · {photos.length}/{MAX_PHOTOS}
        </Text>
        {upload.isPending && <ActivityIndicator size="small" color={colors.bloodBright} />}
      </View>

      {isLoading ? (
        <View style={styles.emptyBox}>
          <ActivityIndicator color={colors.bloodBright} />
        </View>
      ) : photos.length === 0 ? (
        <TouchableOpacity style={styles.emptyBox} onPress={handleAdd} activeOpacity={0.7}>
          <Ionicons name="camera-outline" size={28} color={colors.silver} />
          <Text variant="bodySM" color="silver" style={{ marginTop: spacing.sm }}>
            Añade fotos del concierto
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
                disabled={upload.isPending}
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

      {/* Modal viewer */}
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
