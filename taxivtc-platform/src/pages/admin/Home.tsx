import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Car, LogOut, Users, ShieldCheck, DollarSign, List, Map, Plus, X } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import type { Trip, Driver, License, PricingRule } from '../../types/api';
import { Logo, Card, TripStatusChip, Chip, Spinner, Button, Input } from '../../components/ui';
const LiveMap = lazy(() => import('./LiveMap'));

interface DriverLocation { driverId: string; lat: number; lng: number; heading: number; }

function formatCurrency(value?: number | null) {
  if (typeof value !== 'number') return '--';
  return `${value.toFixed(2)}€`;
}

const NAV_ITEMS = [
  { key: 'map', label: 'Live Map', Icon: Map },
  { key: 'trips', label: 'Trips', Icon: List },
  { key: 'drivers', label: 'Drivers', Icon: Users },
  { key: 'licenses', label: 'Licenses', Icon: Car },
  { key: 'rules', label: 'Pricing', Icon: DollarSign },
];

export default function AdminHome() {
  const { token, logout } = useAuthStore();
  const [liveDrivers, setLiveDrivers] = useState<Record<string, DriverLocation>>({});
  const [view, setView] = useState('map');

  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({ city: '', baseFare: '', minimumFare: '', perKmDay: '', perKmNight: '', waitingPerHour: '' });
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editRuleForm, setEditRuleForm] = useState({ city: '', baseFare: '', minimumFare: '', perKmDay: '', perKmNight: '', waitingPerHour: '' });
  const [isDeletingRuleId, setIsDeletingRuleId] = useState<string | null>(null);

  const counts: Record<string, number> = { trips: trips.length, drivers: drivers.length, licenses: licenses.length, rules: rules.length };

  const verifyDriver = async (driverId: string, status: 'verified' | 'rejected') => {
    setVerifyingId(driverId);
    try {
      const updated = await fetchJson<Driver>(`/api/admin/drivers/${driverId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      setDrivers((prev) => prev.map((d) => (d.id === driverId ? { ...d, verificationStatus: updated.verificationStatus } : d)));
    } catch {
      setError('No se pudo actualizar la verificación');
    } finally {
      setVerifyingId(null);
    }
  };

  const startEditRule = (rule: PricingRule) => {
    setEditingRuleId(rule.id);
    setEditRuleForm({
      city: rule.city,
      baseFare: String(rule.baseFare),
      minimumFare: String(rule.minimumFare),
      perKmDay: String(rule.perKmDay),
      perKmNight: String(rule.perKmNight),
      waitingPerHour: String((rule as any).waitingPerHour ?? ''),
    });
  };

  const saveEditRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRuleId) return;
    setIsSavingRule(true);
    try {
      const updated = await fetchJson<PricingRule>(`/api/admin/pricing-rules/${editingRuleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          city: editRuleForm.city,
          baseFare: parseFloat(editRuleForm.baseFare),
          minimumFare: parseFloat(editRuleForm.minimumFare),
          perKmDay: parseFloat(editRuleForm.perKmDay),
          perKmNight: parseFloat(editRuleForm.perKmNight),
          waitingPerHour: parseFloat(editRuleForm.waitingPerHour),
        }),
      });
      setRules((prev) => prev.map((r) => (r.id === editingRuleId ? updated : r)));
      setEditingRuleId(null);
    } catch {
      setError('No se pudo actualizar la regla');
    } finally {
      setIsSavingRule(false);
    }
  };

  const deleteRule = async (ruleId: string) => {
    setIsDeletingRuleId(ruleId);
    try {
      await fetchJson(`/api/admin/pricing-rules/${ruleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      setError('No se pudo eliminar la regla');
    } finally {
      setIsDeletingRuleId(null);
    }
  };

  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingRule(true);
    try {
      const newRule = await fetchJson<PricingRule>('/api/admin/pricing-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          city: ruleForm.city,
          baseFare: parseFloat(ruleForm.baseFare),
          minimumFare: parseFloat(ruleForm.minimumFare),
          perKmDay: parseFloat(ruleForm.perKmDay),
          perKmNight: parseFloat(ruleForm.perKmNight),
          waitingPerHour: parseFloat(ruleForm.waitingPerHour),
        }),
      });
      setRules((prev) => [...prev, newRule]);
      setShowRuleForm(false);
      setRuleForm({ city: '', baseFare: '', minimumFare: '', perKmDay: '', perKmNight: '', waitingPerHour: '' });
    } catch {
      setError('No se pudo crear la regla de precio');
    } finally {
      setIsSavingRule(false);
    }
  };

  useEffect(() => {
    const eventSource = new EventSource('/api/events/drivers');
    eventSource.addEventListener('driver_location_update', (e) => {
      const location = JSON.parse(e.data);
      if (location.lat && location.lng) {
        setLiveDrivers((prev) => ({ ...prev, [location.driverId]: location }));
      }
    });
    return () => eventSource.close();
  }, [token]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [nextTrips, nextDrivers, nextLicenses, nextRules] = await Promise.all([
          fetchJson<Trip[]>('/api/admin/trips', { headers: { Authorization: `Bearer ${token}` } }),
          fetchJson<Driver[]>('/api/admin/drivers', { headers: { Authorization: `Bearer ${token}` } }),
          fetchJson<License[]>('/api/admin/licenses', { headers: { Authorization: `Bearer ${token}` } }),
          fetchJson<PricingRule[]>('/api/admin/pricing-rules', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setTrips(nextTrips);
        setDrivers(nextDrivers);
        setLicenses(nextLicenses);
        setRules(nextRules);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'No se pudieron cargar los datos de admin');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token, view]);

  const renderTrips = () => (
    <div className="space-y-2">
      {trips.map((trip) => (
        <Card key={trip.id} variant="nested" className="p-4">
          <div className="flex justify-between gap-4">
            <div className="min-w-0">
              <p className="text-eyebrow mb-1">{trip.bookingReference || trip.id.slice(0, 8)}</p>
              <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{trip.passenger?.user?.name || 'Pasajero'}</p>
              <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{trip.originText}</p>
              <p className="text-xs truncate" style={{ color: 'var(--ink-2)' }}>{trip.destinationText}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <TripStatusChip status={trip.status} />
              <p className="text-base font-bold mt-2" style={{ color: 'var(--ink)' }}>
                {formatCurrency(trip.finalPrice ?? trip.agreedPrice ?? trip.estimatedPrice)}
              </p>
              <p className="text-eyebrow mt-0.5">{trip.paymentStatus}</p>
            </div>
          </div>
        </Card>
      ))}
      {trips.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Sin viajes todavía.</p>}
    </div>
  );

  const renderDrivers = () => (
    <div className="space-y-2">
      {drivers.map((driver) => (
        <Card key={driver.id} variant="nested" className="p-4 space-y-3">
          <div className="flex justify-between gap-4">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{driver.user?.name || 'Conductor'}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{driver.user?.email}</p>
              <p className="text-eyebrow mt-1">{driver.licenseNumber}</p>
            </div>
            <div className="text-right flex-shrink-0 space-y-1">
              <Chip variant={driver.status === 'online' ? 'ok' : driver.status === 'busy' ? 'warn' : 'default'}>
                {driver.status}
              </Chip>
              <Chip variant={driver.verificationStatus === 'verified' ? 'ok' : driver.verificationStatus === 'rejected' ? 'danger' : 'default'}>
                {driver.verificationStatus}
              </Chip>
            </div>
          </div>
          {driver.verificationStatus === 'pending' && (
            <div className="flex gap-2 pt-1" style={{ borderTop: '1px solid var(--line)' }}>
              <Button variant="danger" size="sm" className="flex-1"
                disabled={verifyingId === driver.id}
                loading={verifyingId === driver.id}
                onClick={() => verifyDriver(driver.id, 'rejected')}>
                Rechazar
              </Button>
              <Button variant="primary" size="sm" className="flex-[2]"
                disabled={verifyingId === driver.id}
                loading={verifyingId === driver.id}
                onClick={() => verifyDriver(driver.id, 'verified')}>
                <ShieldCheck className="w-3.5 h-3.5" /> Verificar
              </Button>
            </div>
          )}
        </Card>
      ))}
      {drivers.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Sin conductores registrados.</p>}
    </div>
  );

  const renderLicenses = () => (
    <div className="space-y-2">
      {licenses.map((license) => (
        <Card key={license.id} variant="nested" className="p-4 flex justify-between gap-4">
          <div>
            <p className="font-semibold text-sm font-mono" style={{ color: 'var(--ink)' }}>{license.licenseCode}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{license.municipality}</p>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{license.ownerName}</p>
          </div>
          <div className="text-right flex-shrink-0 space-y-1">
            <Chip variant={license.isActive ? 'ok' : 'default'}>{license.isActive ? 'Activa' : 'Inactiva'}</Chip>
            <p className="text-eyebrow block">{license.drivers?.length || 0} conductores</p>
          </div>
        </Card>
      ))}
      {licenses.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Sin licencias cargadas.</p>}
    </div>
  );

  const renderRules = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-eyebrow">Tarifas configuradas</p>
        <Button variant="secondary" size="sm" onClick={() => setShowRuleForm((v) => !v)}>
          {showRuleForm ? <><X className="w-3.5 h-3.5" /> Cancelar</> : <><Plus className="w-3.5 h-3.5" /> Nueva tarifa</>}
        </Button>
      </div>

      {showRuleForm && (
        <Card variant="nested" className="p-5">
          <form onSubmit={saveRule} className="space-y-4">
            <p className="text-eyebrow mb-3">Nueva regla de precio</p>
            <Input label="Ciudad" value={ruleForm.city} onChange={(e) => setRuleForm({ ...ruleForm, city: e.target.value })} placeholder="A Coruña" required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tarifa base (€)" type="number" step="0.01" value={ruleForm.baseFare} onChange={(e) => setRuleForm({ ...ruleForm, baseFare: e.target.value })} placeholder="2.40" required />
              <Input label="Tarifa mínima (€)" type="number" step="0.01" value={ruleForm.minimumFare} onChange={(e) => setRuleForm({ ...ruleForm, minimumFare: e.target.value })} placeholder="6.00" required />
              <Input label="€/km día" type="number" step="0.01" value={ruleForm.perKmDay} onChange={(e) => setRuleForm({ ...ruleForm, perKmDay: e.target.value })} placeholder="1.10" required />
              <Input label="€/km noche" type="number" step="0.01" value={ruleForm.perKmNight} onChange={(e) => setRuleForm({ ...ruleForm, perKmNight: e.target.value })} placeholder="1.30" required />
              <Input label="€/hora espera" type="number" step="0.01" value={ruleForm.waitingPerHour} onChange={(e) => setRuleForm({ ...ruleForm, waitingPerHour: e.target.value })} placeholder="18.00" required />
            </div>
            <Button variant="primary" size="md" fullWidth loading={isSavingRule} disabled={isSavingRule}>
              Guardar tarifa
            </Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {rules.map((rule) => (
          <Card key={rule.id} variant="nested" className="p-4 space-y-3">
            {editingRuleId === rule.id ? (
              <form onSubmit={saveEditRule} className="space-y-3">
                <Input label="Ciudad" value={editRuleForm.city} onChange={(e) => setEditRuleForm({ ...editRuleForm, city: e.target.value })} required />
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Base (€)" type="number" step="0.01" value={editRuleForm.baseFare} onChange={(e) => setEditRuleForm({ ...editRuleForm, baseFare: e.target.value })} required />
                  <Input label="Mínimo (€)" type="number" step="0.01" value={editRuleForm.minimumFare} onChange={(e) => setEditRuleForm({ ...editRuleForm, minimumFare: e.target.value })} required />
                  <Input label="€/km día" type="number" step="0.01" value={editRuleForm.perKmDay} onChange={(e) => setEditRuleForm({ ...editRuleForm, perKmDay: e.target.value })} required />
                  <Input label="€/km noche" type="number" step="0.01" value={editRuleForm.perKmNight} onChange={(e) => setEditRuleForm({ ...editRuleForm, perKmNight: e.target.value })} required />
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1" type="button" onClick={() => setEditingRuleId(null)}>
                    <X className="w-3.5 h-3.5" /> Cancelar
                  </Button>
                  <Button variant="primary" size="sm" className="flex-[2]" loading={isSavingRule} disabled={isSavingRule}>
                    Guardar cambios
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{rule.city}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      Base {formatCurrency(rule.baseFare)} · Mínimo {formatCurrency(rule.minimumFare)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                      Día {formatCurrency(rule.perKmDay)}/km · Noche {formatCurrency(rule.perKmNight)}/km
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button variant="secondary" size="sm" onClick={() => startEditRule(rule)}>
                      Editar
                    </Button>
                    <Button variant="danger" size="sm"
                      loading={isDeletingRuleId === rule.id}
                      disabled={isDeletingRuleId === rule.id}
                      onClick={() => deleteRule(rule.id)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        ))}
        {rules.length === 0 && !showRuleForm && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Sin reglas de precio definidas.</p>}
      </div>
    </div>
  );

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', color: 'var(--ink)' }} className="flex font-sans">
      {/* Sidebar */}
      <aside style={{ width: 220, background: 'var(--panel)', borderRight: '1px solid var(--line)', flexShrink: 0 }}
        className="flex flex-col justify-between p-5">
        <div>
          <div className="mb-8">
            <Logo size="sm" />
            <p className="text-eyebrow mt-2 ml-0.5">Control Panel</p>
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map(({ key, label, Icon }) => {
              const active = view === key;
              const count = counts[key];
              return (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  style={{
                    background: active ? 'color-mix(in srgb, var(--accent) 8%, var(--panel-2))' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--ink-3)',
                    borderRadius: 'var(--r-sm)',
                    border: active ? '1px solid color-mix(in srgb, var(--accent) 15%, transparent)' : '1px solid transparent',
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all hover:bg-white/5"
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                  {count !== undefined && (
                    <span className="text-eyebrow" style={{ color: active ? 'var(--accent)' : 'var(--ink-4)' }}>{count}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        <button
          onClick={logout}
          style={{ color: 'var(--ink-3)', borderRadius: 'var(--r-sm)' }}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Cerrar sesión
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 relative overflow-hidden">
        {/* Live Map */}
        {view === 'map' && (
          <Suspense fallback={
            <div className="h-full w-full flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--ink-3)', background: 'var(--bg)' }}>
              <Spinner size={14} /> Cargando mapa...
            </div>
          }>
            <LiveMap liveDrivers={liveDrivers} />
          </Suspense>
        )}

        {/* Data views */}
        {view !== 'map' && (
          <div className="h-full overflow-y-auto p-8">
            <div className="max-w-4xl">
              <h1 className="text-2xl font-semibold capitalize mb-6" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
                {NAV_ITEMS.find((n) => n.key === view)?.label}
              </h1>

              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Viajes', value: trips.length },
                  { label: 'Conductores', value: drivers.length },
                  { label: 'Licencias', value: licenses.length },
                  { label: 'Reglas', value: rules.length },
                ].map((card) => (
                  <Card key={card.label} className="p-4">
                    <p className="text-eyebrow">{card.label}</p>
                    <p className="text-2xl font-bold mt-2" style={{ color: 'var(--ink)' }}>{card.value}</p>
                  </Card>
                ))}
              </div>

              {error && (
                <div style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 20%, transparent)', color: 'var(--danger)' }}
                  className="border p-3 rounded-[var(--r-md)] text-sm font-medium mb-4">
                  {error}
                </div>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'var(--ink-3)' }}>
                  <Spinner size={16} /> Cargando datos operativos...
                </div>
              ) : (
                <>
                  {view === 'trips' && renderTrips()}
                  {view === 'drivers' && renderDrivers()}
                  {view === 'licenses' && renderLicenses()}
                  {view === 'rules' && renderRules()}
                </>
              )}
            </div>
          </div>
        )}

        {/* Live drivers badge */}
        <div style={{ background: 'color-mix(in srgb, var(--panel) 90%, transparent)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', backdropFilter: 'blur(12px)' }}
          className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 shadow-lg">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--ok)' }} />
          <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{Object.keys(liveDrivers).length}</span>
          <span className="text-sm" style={{ color: 'var(--ink-3)' }}>online</span>
        </div>
      </main>
    </div>
  );
}
