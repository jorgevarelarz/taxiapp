import React from 'react';
import { Car } from 'lucide-react';

export default function AppLoading({ label = 'Cargando TaxiVTC...' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-white text-zinc-900 flex items-center justify-center shadow-2xl">
          <Car className="w-9 h-9" />
        </div>
        <div className="text-center">
          <p className="text-lg font-black tracking-tighter uppercase italic">TaxiVTC</p>
          <p className="text-sm text-zinc-400">{label}</p>
        </div>
      </div>
    </div>
  );
}
