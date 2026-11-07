import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ──────────────────────────────────────────────────────────────────────────
 * Kit compartilhado do SubWebNavigator (linguagem visual do design system
 * Datatoms). Componentes pequenos e previsíveis.
 * ────────────────────────────────────────────────────────────────────────── */

export const formFieldClass =
  'w-full min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 dark:border-[#282828] dark:bg-[#181818] dark:text-slate-100 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 dark:focus:border-[#404040] dark:focus:ring-white/10 disabled:cursor-not-allowed disabled:opacity-60 md:min-h-9 md:text-sm';

export const formLabelClass = 'block truncate whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5';

/** Cabeçalho padrão de página: título, subtítulo, voltar e ações. */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  backTo,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  backTo?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {backTo ? (
          <Link to={backTo} className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-[#282828] dark:hover:bg-white/5" aria-label="Voltar">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : Icon ? (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 dark:border-[#282828] dark:bg-[#181818] dark:text-white">
            <Icon className="h-4 w-4" strokeWidth={1.5} />
          </div>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{eyebrow}</div> : null}
          <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-white sm:text-xl">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500 dark:text-[#b3b3b3] sm:text-[13px]">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-premium-soft',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-[#282828] dark:bg-[#181818] dark:text-[#e0e0e0] dark:hover:bg-[#242424]',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-[#b3b3b3] dark:hover:bg-white/5',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[11px] gap-1.5',
  md: 'h-9 px-3.5 text-[12px] gap-2',
  lg: 'h-11 px-5 text-[13px] gap-2',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: LucideIcon }
>(function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-semibold transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(formFieldClass, className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(formFieldClass, 'pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(formFieldClass, 'min-h-[88px] resize-y', className)} {...props} />;
});

/** Campo com label, hint e erro. O label fica numa linha só para alinhar campos vizinhos. */
export function Field({ label, hint, error, required, children, className }: { label: ReactNode; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className={formLabelClass} title={typeof label === 'string' ? label : undefined}>
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

export type Tone = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'sky' | 'teal' | 'orange';
export const TONE_KEYS: Tone[] = ['slate', 'blue', 'emerald', 'amber', 'rose', 'violet', 'sky', 'teal', 'orange'];

export const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-[#242424] dark:text-slate-300',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  orange: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
};

/** Cor sólida do tom (pontos, swatches). */
export const TONE_DOT: Record<Tone, string> = {
  slate: 'bg-slate-500',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  sky: 'bg-sky-500',
  teal: 'bg-teal-500',
  orange: 'bg-orange-500',
};

export function Badge({ tone = 'slate', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap', TONES[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

/** Card de indicador (KPI). */
export function KpiCard({ label, value, hint, icon: Icon, tone = 'slate', className }: { label: string; value: number | string; hint?: ReactNode; icon?: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <div className={cn('card-premium flex items-start justify-between gap-3 p-4', className)}>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
        <div className="mt-1 truncate text-[17px] font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</div>
        {hint ? <div className="mt-1 text-[11px] text-slate-500 dark:text-[#b3b3b3]">{hint}</div> : null}
      </div>
      {Icon ? (
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center dark:border-[#303030]', className)}>
      {Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400 dark:bg-white/5">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
      ) : null}
      <h3 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h3>
      {description ? <div className="mt-1 max-w-sm text-xs text-slate-500 dark:text-[#b3b3b3]">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Card({ children, className, title, subtitle, actions, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={cn('card-premium overflow-hidden', className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#242424]">
          <div className="min-w-0">
            <h2 className="truncate text-[12px] font-bold uppercase tracking-wider text-slate-700 dark:text-white">{title}</h2>
            {subtitle ? <p className="text-[11px] text-slate-400">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(padded && 'p-4')}>{children}</div>
    </section>
  );
}

/** Linha de metadado (label: valor) para painéis de detalhe. */
export function InfoRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-0.5 py-1.5', className)}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-[13px] text-slate-800 dark:text-slate-100">{children ?? '—'}</span>
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400', className)}>{children}</h3>;
}

/** Controle segmentado (escolha única entre poucas opções). */
export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-[#282828] dark:bg-[#181818]">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'min-w-[52px] rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60',
              active ? 'bg-white text-slate-900 shadow-sm dark:bg-[#2a2a2a] dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-[#b3b3b3] dark:hover:text-white',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Interruptor acessível (role=switch). */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-60',
        checked ? 'bg-slate-900 dark:bg-white' : 'bg-slate-200 dark:bg-[#333]',
      )}
    >
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform dark:bg-[#121212]', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

/** Linha de configuração estilo painel de preferências: título + descrição à esquerda, controle à direita. */
export function SettingsRow({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 py-3.5 last:border-b-0 dark:border-[#242424] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-slate-800 dark:text-white">{title}</div>
        {description ? <div className="mt-0.5 text-[12px] leading-5 text-slate-500 dark:text-[#b3b3b3]">{description}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
