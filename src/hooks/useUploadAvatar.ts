import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import i18n from '../i18n';

async function pickAvatar() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(i18n.t('errors.libraryPermissionDenied'));
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsEditing: true,
    aspect: [1, 1],
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await pickAvatar();
      if (result.canceled || !result.assets?.[0]) return null;

      const asset = result.assets[0];

      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );

      const arrayBuffer = await fetch(manipulated.uri).then((res) => res.arrayBuffer());

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(i18n.t('errors.noSession'));

      const storagePath = `${user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(storagePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(storagePath);
      const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id);
      if (updateError) throw updateError;

      return avatarUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
