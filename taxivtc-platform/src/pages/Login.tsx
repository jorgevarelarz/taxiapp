import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Logo, Button, Input, Card } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setAuth(data.user, data.token);
        navigate(`/${data.user.role}`);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Error de conexión');
    }
  };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }} className="flex items-center justify-center p-5">
      <div className="w-full max-w-sm space-y-10">
        <div className="flex flex-col items-center gap-3">
          <Logo size="lg" />
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Transporte premium en A Coruña</p>
        </div>

        <Card className="p-8 space-y-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>Bienvenido de nuevo</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>Inicia sesión en tu cuenta</p>
          </div>

          {error && (
            <div style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 25%, transparent)', color: 'var(--danger)' }}
              className="border p-3 rounded-[var(--r-sm)] text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
            />
            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <Button variant="primary" size="lg" fullWidth type="submit">
              Iniciar Sesión
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm" style={{ color: 'var(--ink-3)' }}>
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
            Regístrate aquí
          </Link>
        </p>
      </div>
    </div>
  );
}
