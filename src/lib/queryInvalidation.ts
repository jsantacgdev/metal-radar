import { QueryClient } from '@tanstack/react-query';

export function invalidateUserDataQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['diary'] });
  queryClient.invalidateQueries({ queryKey: ['profileStats'] });
  queryClient.invalidateQueries({ queryKey: ['nearbyConcerts'] });
}

// Tras sincronizar con Ticketmaster pueden cambiar conciertos cercanos y el
// detalle (fecha, lineup, precios) de cualquier concierto ya cargado.
export function invalidateConcertQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['nearbyConcerts'] });
  queryClient.invalidateQueries({ queryKey: ['concert'] });
}
