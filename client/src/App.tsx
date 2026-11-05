import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Suspense, lazy, type ReactNode } from 'react';
import { ToastContainer } from 'react-toastify';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { ThemeProvider } from './context/ThemeProvider';
import LoadingSpinner from '@jerecocc/tracker-ui/components/LoadingSpinner/LoadingSpinner';

const LoginPage = lazy(() => import('./pages/login/Login'));
const SignupPage = lazy(() => import('./pages/signup/Signup'));
const AuthCallbackPage = lazy(() => import('./pages/auth/callback/AuthCallback'));

const UserLayout = lazy(() => import('@/shared/UserLayout/UserLayout'));

const UserDashboard = lazy(() => import('./pages/user/dashboard/UserDashboard'));
const EventsPage = lazy(() => import('./pages/user/events/Events'));
const QuizzesPage = lazy(() => import('./pages/user/quizzes/Quizzes'));
const QuizDetailsPage = lazy(() => import('./pages/user/quizzes/details/QuizDetails'));

const PrivateRoute = (props: { children: ReactNode }) => {
  const { children } = props;
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? (
    <>{children}</>
  ) : (
    <Navigate
      to="/login"
      replace
    />
  );
};

const PublicRoute = (props: { children: ReactNode }) => {
  const { children } = props;
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? (
    <Navigate
      to="/dashboard"
      replace
    />
  ) : (
    <>{children}</>
  );
};

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Navigate
        to="/login"
        replace
      />
    ),
  },
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
  },
  {
    path: '/signup',
    element: (
      <PublicRoute>
        <SignupPage />
      </PublicRoute>
    ),
  },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: (
      <PrivateRoute>
        <UserLayout />
      </PrivateRoute>
    ),
    children: [
      { path: '/dashboard', element: <UserDashboard /> },
      { path: '/events', element: <EventsPage /> },
      { path: '/quizzes', element: <QuizzesPage /> },
      { path: '/quizzes/:quizId', element: <QuizDetailsPage /> },
    ],
  },
  {
    path: '*',
    element: (
      <Navigate
        to="/login"
        replace
      />
    ),
  },
]);

const AppShell = () => {
  const { theme } = useTheme();

  return (
    <AuthProvider>
      <ToastContainer
        position="bottom-right"
        autoClose={4000}
        hideProgressBar
        theme={theme}
      />
      <Suspense
        fallback={
          <LoadingSpinner
            layout="page"
            size="lg"
          />
        }
      >
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  );
};

const App = () => (
  <ThemeProvider>
    <AppShell />
  </ThemeProvider>
);

export default App;
