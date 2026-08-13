'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30s antes de considerar datos obsoletos
            gcTime: 5 * 60 * 1000, // 5min en caché
            refetchOnWindowFocus: true, // Mostrar cambios recientes al volver a la aplicación
            retry: 1, // Solo 1 reintento
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
