import { Loader2 } from 'lucide-react';
import { DatatomsLogo } from '@/assets/logo/logo';

export default function LoadingScreen({ label = 'Carregando', hint = 'Preparando ambiente...' }: { label?: string; hint?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 min-h-[320px] animate-in fade-in duration-500">
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 scale-150 bg-brand-500/10 blur-3xl rounded-full" />
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white dark:bg-[#1a1a1a] shadow-2xl border border-slate-200 dark:border-white/5">
            <DatatomsLogo size={40} className="animate-pulse" />
          </div>
          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg ring-2 ring-white dark:ring-[#121212]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </div>
        </div>
      </div>
      <div className="mt-8 flex flex-col items-center gap-2">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-widest">{label}</h3>
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{hint}</p>
      </div>
    </div>
  );
}
