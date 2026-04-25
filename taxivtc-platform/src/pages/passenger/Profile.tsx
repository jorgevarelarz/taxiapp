import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ArrowLeft, User, Mail, Phone, Edit2, Check, X } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Logo, Card, Button, Input } from '../../components/ui';

export default function PassengerProfile() {
  const { user, token, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const updated = await fetchJson<any>('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        }),
      });
      setAuth(updated, token!);
      setIsEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setName(user?.name ?? '');
    setPhone('');
    setError(null);
    setIsEditing(false);
  };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--ink)' }} className="font-sans flex flex-col">
      <header style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}
        className="p-4 flex items-center gap-4 sticky top-0 z-20">
        <button onClick={() => navigate('/passenger')} className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors">
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--ink-3)' }} />
        </button>
        <Logo size="sm" />
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4 pb-8">
        {/* Avatar */}
        <div className="flex flex-col items-center pt-6 pb-2 gap-3">
          <div style={{ width: 80, height: 80, background: 'var(--panel)', border: '2px solid var(--line)', borderRadius: 'var(--r-xl)' }}
            className="flex items-center justify-center">
            <User className="w-10 h-10" style={{ color: 'var(--ink-3)' }} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>{user?.name}</h1>
            <p className="text-eyebrow mt-0.5">Pasajero</p>
          </div>
        </div>

        {error && (
          <div style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 20%, transparent)', color: 'var(--danger)' }}
            className="border p-3 rounded-[var(--r-md)] text-sm font-medium">
            {error}
          </div>
        )}

        {/* Datos */}
        <Card className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-eyebrow">Información personal</p>
            {!isEditing && (
              <button onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:opacity-80"
                style={{ color: 'var(--accent)' }}>
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder={user?.name} />
              <Input label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Nuevo teléfono" type="tel" />
              <div className="flex gap-3 pt-1">
                <Button variant="ghost" size="md" className="flex-1" onClick={handleCancel}>
                  <X className="w-4 h-4" /> Cancelar
                </Button>
                <Button variant="primary" size="md" className="flex-[2]"
                  onClick={handleSave} loading={isSaving} disabled={isSaving}>
                  <Check className="w-4 h-4" /> Guardar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { Icon: User, label: 'Nombre', value: user?.name },
                { Icon: Mail, label: 'Email', value: user?.email },
              ].map(({ Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <div style={{ width: 36, height: 36, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}
                    className="flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />
                  </div>
                  <div>
                    <p className="text-eyebrow">{label}</p>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Rol */}
        <Card variant="nested" className="p-4 flex items-center gap-3">
          <div style={{ width: 36, height: 36, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderRadius: 'var(--r-sm)' }}
            className="flex items-center justify-center flex-shrink-0">
            <Phone className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-eyebrow">Tipo de cuenta</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Pasajero</p>
          </div>
        </Card>
      </main>
    </div>
  );
}
