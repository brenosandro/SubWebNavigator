import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // Erros de autenticação/bloqueio não são repetidos: o interceptor já trata.
      retry: (count, err) => {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (status && status < 500) return false;
        return count < 1;
      },
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" toastOptions={{ duration: 3500, style: { background: '#18181b', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.08)', fontSize: 13 } }} />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
