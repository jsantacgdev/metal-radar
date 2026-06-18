import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

type Args = {
  userFestivalId: string;
  source: 'camera' | 'library';
};

async function pickImage(source: 'camera' | 'library') {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error(i18n.t('errors.cameraPermissionDenied'));
    return ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      exif: true,
    });
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error(i18n.t('errors.libraryPermissionDenied'));
    return ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      exif: true,
    });
  }
}

export function useUploadFestivalPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userFestivalId, source }: Args) => {
      const result = await pickImage(source);
      if (result.canceled || !result.assets?.[0]) return null;

      const asset = result.assets[0];

      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );

      const arrayBuffer = await fetch(manipulated.uri).then((res) => res.arrayBuffer());

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));

      const filename = `${Date.now()}.jpg`;
      const storagePath = `${user.id}/${userFestivalId}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from('festival-photos')
        .upload(storagePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const takenAt = asset.exif?.DateTimeOriginal
        ? new Date(asset.exif.DateTimeOriginal.replace(/:/, '-').replace(/:/, '-'))
        : null;

      const { error: insertError } = await supabase.from('festival_photos').insert({
        user_festival_id: userFestivalId,
        user_id: user.id,
        storage_path: storagePath,
        taken_at: takenAt?.toISOString() ?? null,
      });

      if (insertError) {
        await supabase.storage.from('festival-photos').remove([storagePath]);
        throw insertError;
      }

      return storagePath;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['festival-photos', vars.userFestivalId] });
    },
  });
}
