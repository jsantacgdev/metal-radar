import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../lib/supabase';

type Args = {
  userConcertId: string;
  source: 'camera' | 'library';
};

async function pickImage(source: 'camera' | 'library') {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Permiso de cámara denegado');
    return ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      exif: true,
    });
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Permiso de galería denegado');
    return ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      exif: true,
    });
  }
}

export function useUploadConcertPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userConcertId, source }: Args) => {
      const result = await pickImage(source);
      if (result.canceled || !result.assets?.[0]) return null;

      const asset = result.assets[0];

      // Resize a 1600px max + jpeg 80%
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );

      // Leer bytes
      const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: 'base64',
      });
      const byteArray = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      // Sesión actual
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sin sesión');

      // Path: {user_id}/{user_concert_id}/{timestamp}.jpg
      const filename = `${Date.now()}.jpg`;
      const storagePath = `${user.id}/${userConcertId}/${filename}`;

      // Subir a Storage
      const { error: uploadError } = await supabase.storage
        .from('concert-photos')
        .upload(storagePath, byteArray, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      // Registrar en BD
      const takenAt = asset.exif?.DateTimeOriginal
        ? new Date(asset.exif.DateTimeOriginal.replace(/:/, '-').replace(/:/, '-'))
        : null;

      const { error: insertError } = await supabase.from('concert_photos').insert({
        user_concert_id: userConcertId,
        user_id: user.id,
        storage_path: storagePath,
        taken_at: takenAt?.toISOString() ?? null,
      });

      if (insertError) {
        // Rollback del archivo si falla la inserción
        await supabase.storage.from('concert-photos').remove([storagePath]);
        throw insertError;
      }

      return storagePath;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['concert-photos', vars.userConcertId] });
    },
  });
}
