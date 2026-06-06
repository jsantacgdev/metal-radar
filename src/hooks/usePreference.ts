import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function usePreference<T extends string | number | boolean>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(key).then((stored) => {
      if (stored !== null) {
        try {
          setValue(JSON.parse(stored) as T);
        } catch {
          // ignore
        }
      }
      setLoaded(true);
    });
  }, [key]);

  const update = async (next: T) => {
    setValue(next);
    await AsyncStorage.setItem(key, JSON.stringify(next));
  };

  return { value, setValue: update, loaded };
}
