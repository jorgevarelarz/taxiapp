import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import PassengerHome from './pages/passenger/Home';
import DriverHome from './pages/driver/Home';
import AdminHome from './pages/admin/Home';

import { useAuthStore } from './store/authStore';

const queryClient = new QueryClient();

const ProtectedRoute = ({ children, role }: { children: React.ReactNode; role?: string }) => {
  const { user, token } = useAuthStore();
  
  if (!token) return <Navigate to="/login" />;
  if (role && user?.role !== role) return <Navigate to="/" />;
  
  return <>{children}</>;
};

export default function App() {
  const { user } = useAuthStore();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/passenger/*" element={
            <ProtectedRoute role="passenger">
              <PassengerHome />
            </ProtectedRoute>
          } />
          
          <Route path="/driver/*" element={
            <ProtectedRoute role="driver">
              <DriverHome />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/*" element={
            <ProtectedRoute role="admin">
              <AdminHome />
            </ProtectedRoute>
          } />

          <Route path="/" element={
            user ? (
              <Navigate to={`/${user.role}`} />
            ) : (
              <Navigate to="/login" />
            )
          } />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
