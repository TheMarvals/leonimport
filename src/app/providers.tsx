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
            refetchOnWindowFocus: false, // No recargar al cambiar de pestaña
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
