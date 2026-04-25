import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import AppLoading from './components/AppLoading';

const queryClient = new QueryClient();
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const PassengerHome = lazy(() => import('./pages/passenger/Home'));
const PassengerHistory = lazy(() => import('./pages/passenger/History'));
const DriverHome = lazy(() => import('./pages/driver/Home'));
const DriverEarnings = lazy(() => import('./pages/driver/Earnings'));
const AdminHome = lazy(() => import('./pages/admin/Home'));

const ProtectedRoute = ({ children, role }: { children: React.ReactNode; role?: string }) => {
  const { user, token, isHydrating } = useAuthStore();
  
  if (isHydrating) return <AppLoading label="Restaurando sesión..." />;
  if (!token) return <Navigate to="/login" />;
  if (role && user?.role !== role) return <Navigate to="/" />;
  
  return <>{children}</>;
};

export default function App() {
  const { user, token, isHydrating, hydrateSession } = useAuthStore();

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  if (isHydrating) {
    return <AppLoading label="Preparando aplicación..." />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<AppLoading label="Cargando vista..." />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            <Route path="/passenger" element={
              <ProtectedRoute role="passenger">
                <PassengerHome />
              </ProtectedRoute>
            } />
            <Route path="/passenger/history" element={
              <ProtectedRoute role="passenger">
                <PassengerHistory />
              </ProtectedRoute>
            } />
            
            <Route path="/driver" element={
              <ProtectedRoute role="driver">
                <DriverHome />
              </ProtectedRoute>
            } />
            <Route path="/driver/earnings" element={
              <ProtectedRoute role="driver">
                <DriverEarnings />
              </ProtectedRoute>
            } />
            
            <Route path="/admin/*" element={
              <ProtectedRoute role="admin">
                <AdminHome />
              </ProtectedRoute>
            } />

            <Route path="/" element={
              user && token ? (
                <Navigate to={`/${user.role}`} />
              ) : (
                <Navigate to="/login" />
              )
            } />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
