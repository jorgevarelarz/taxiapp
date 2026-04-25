import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { User, ShieldCheck } from 'lucide-react';
import { Logo, Button, Input, Card } from '../components/ui';

export default function Register() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    role: 'passenger' as 'passenger' | 'driver',
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
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
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Crea tu cuenta en segundos</p>
        </div>

        <Card className="p-8 space-y-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>Únete a NORA</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>Elige cómo quieres usar la plataforma</p>
          </div>

          {error && (
            <div style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 25%, transparent)', color: 'var(--danger)' }}
              className="border p-3 rounded-[var(--r-sm)] text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Role selector */}
            <div className="grid grid-cols-2 gap-3">
              {(['passenger', 'driver'] as const).map((role) => {
                const active = formData.role === role;
                const Icon = role === 'passenger' ? User : ShieldCheck;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setFormData({ ...formData, role })}
                    style={{
                      background: active ? 'color-mix(in srgb, var(--accent) 8%, var(--panel-2))' : 'var(--panel-2)',
                      borderColor: active ? 'var(--accent)' : 'var(--line)',
                      color: active ? 'var(--accent)' : 'var(--ink-3)',
                      borderRadius: 'var(--r-md)',
                    }}
                    className="flex flex-col items-center gap-2 p-4 border transition-all"
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-semibold capitalize">{role === 'passenger' ? 'Pasajero' : 'Conductor'}</span>
                  </button>
                );
              })}
            </div>

            <Input
              label="Nombre Completo"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Juan Pérez"
              required
            />
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="tu@email.com"
              required
            />
            <Input
              label="Teléfono"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+34 600 000 000"
              required
            />
            <Input
              label="Contraseña"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              required
            />
            <Button variant="primary" size="lg" fullWidth type="submit">
              Crear Cuenta
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm" style={{ color: 'var(--ink-3)' }}>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
