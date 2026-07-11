import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type SearchedUser = { id: string; username: string | null; display_name: string | null };

export function useUserSearch(query: string) {
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let q = supabase
          .from('profiles')
          .select('id, username, display_name')
          .ilike('username', `%${trimmed}%`)
          .not('username', 'is', null)
          .limit(20);
        if (user) q = q.neq('id', user.id);
        const { data, error } = await q;
        if (!error) setResults(data ?? []);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, searching };
}
