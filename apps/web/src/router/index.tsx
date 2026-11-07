import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { ProtectedRoute, RequireLoaded, RootShell } from '@/components/auth/guards';
import { RouteErrorBoundary } from '@/components/shared/ErrorBoundary';
import LoadingScreen from '@/components/shared/LoadingScreen';

const LandingPage = lazy(() => import('@/pages/landing/LandingPage'));
const Login = lazy(() => import('@/pages/auth/Login'));
const SecurityKeyPage = lazy(() => import('@/pages/auth/SecurityKeyPage'));
const LockScreen = lazy(() => import('@/pages/auth/LockScreen'));
const WorkspacePage = lazy(() => import('@/pages/workspace/WorkspacePage'));
const ProfilesPage = lazy(() => import('@/pages/profiles/ProfilesPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));

const page = (el: ReactNode) => (
  <Suspense
    fallback={
      <div className="flex min-h-[100dvh] bg-[#f5f2ee] dark:bg-[#121212]">
        <LoadingScreen />
      </div>
    }
  >
    {el}
  </Suspense>
);

export const router = createBrowserRouter([
  {
    element: <RootShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/', element: page(<LandingPage />) },
      { path: '/login', element: page(<RequireLoaded><Login /></RequireLoaded>) },
      { path: '/entrar/chave', element: page(<RequireLoaded><SecurityKeyPage /></RequireLoaded>) },
      { path: '/bloqueado', element: page(<RequireLoaded><LockScreen /></RequireLoaded>) },
      {
        path: '/app',
        element: (
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <WorkspacePage /> },
          { path: 'perfis', element: <ProfilesPage /> },
          { path: 'configuracoes', element: <SettingsPage /> },
          { path: '*', element: <Navigate to="/app" replace /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
