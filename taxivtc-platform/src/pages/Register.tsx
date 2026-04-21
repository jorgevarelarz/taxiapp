import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Car, User, ShieldCheck } from 'lucide-react';

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
    } catch (err) {
      setError('Error de conexión');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-zinc-100">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Car className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Únete a TaxiVTC</h1>
          <p className="text-zinc-500 mt-2">Crea tu cuenta en segundos</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 text-sm font-medium border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, role: 'passenger' })}
              className={`flex flex-col items-center p-4 rounded-2xl border-2 transition-all ${
                formData.role === 'passenger' ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-100 hover:border-zinc-200'
              }`}
            >
              <User className={`w-6 h-6 mb-2 ${formData.role === 'passenger' ? 'text-zinc-900' : 'text-zinc-400'}`} />
              <span className={`text-sm font-bold ${formData.role === 'passenger' ? 'text-zinc-900' : 'text-zinc-400'}`}>Pasajero</span>
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, role: 'driver' })}
              className={`flex flex-col items-center p-4 rounded-2xl border-2 transition-all ${
                formData.role === 'driver' ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-100 hover:border-zinc-200'
              }`}
            >
              <ShieldCheck className={`w-6 h-6 mb-2 ${formData.role === 'driver' ? 'text-zinc-900' : 'text-zinc-400'}`} />
              <span className={`text-sm font-bold ${formData.role === 'driver' ? 'text-zinc-900' : 'text-zinc-400'}`}>Conductor</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Nombre Completo</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
              placeholder="Juan Pérez"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
              placeholder="tu@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Teléfono</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
              placeholder="+34 600 000 000"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Contraseña</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-zinc-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-zinc-800 transition-colors shadow-lg active:scale-[0.98] mt-4"
          >
            Crear Cuenta
          </button>
        </form>

        <p className="mt-8 text-center text-zinc-500 text-sm">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-zinc-900 font-bold hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
