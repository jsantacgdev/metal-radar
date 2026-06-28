import { QueryClient } from '@tanstack/react-query';

export function invalidateUserDataQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['diary'] });
  queryClient.invalidateQueries({ queryKey: ['profileStats'] });
  queryClient.invalidateQueries({ queryKey: ['nearbyConcerts'] });
}
