import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage, SupportedLanguage } from './index';
import { useProfile } from '../hooks/useProfile';

export function useLanguage() {
  const { i18n } = useTranslation();
  const { profile, update } = useProfile();

  const changeLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      await setLanguage(lang);

      if (profile) {
        await update({ language: lang });
      }
    },
    [profile, update],
  );

  return {
    current: i18n.language as SupportedLanguage,
    changeLanguage,
  };
}
