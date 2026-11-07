import { useEffect, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type MaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
const WIDTHS: Record<MaxWidth, string> = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-xl', '2xl': 'sm:max-w-2xl', '4xl': 'sm:max-w-4xl' };

/* ──────────────────────────────────────────────────────────────────────────
 * Por que os modais são "não bloqueantes" (modal={false}).
 *
 * No modo bloqueante o Radix faz duas coisas com o resto da página: zera o
 * `pointer-events` do body e prende o foco dentro do diálogo. Toda lista
 * suspensa do sistema (colaborador, função, serviço…) vive num portal preso ao
 * body, fora do diálogo — então ela abria, mas não aceitava clique, rolagem do
 * mouse nem digitação: o foco voltava sozinho para o campo.
 *
 * Aqui a cortina é uma div nossa, o fechamento por Esc e por clique fora
 * continua com o Radix, e a rolagem do fundo é travada na mão. O diálogo
 * continua parecendo e se comportando como modal, mas as listas funcionam.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Trava a rolagem do fundo enquanto houver diálogo aberto.
 *
 * O contador é do módulo inteiro porque diálogos se empilham e não fecham
 * necessariamente na ordem em que abriram — o valor original do `overflow` é
 * guardado uma única vez, quando o primeiro abre, e devolvido quando o último
 * fecha.
 */
let travas = 0;
let overflowOriginal = '';

function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (travas === 0) overflowOriginal = document.body.style.overflow;
    travas += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      travas -= 1;
      if (travas === 0) document.body.style.overflow = overflowOriginal;
    };
  }, [active]);
}

/**
 * Interação que não pode fechar o diálogo: lista suspensa (portal no body) e
 * qualquer diálogo aberto por cima deste. Sem o modo bloqueante do Radix, as
 * camadas não se empilham sozinhas — um clique dentro do painel de cima
 * chegaria aqui como "clique fora" e fecharia o de baixo.
 */
function ehCamadaDeCima(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('[data-floating-layer], [data-dialog-layer]');
}

/**
 * Modal central (desktop) que vira folha de baixo para cima no mobile.
 * Uso: <Modal open onClose title footer>…</Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'lg',
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: MaxWidth;
  icon?: ReactNode;
}) {
  useLockBodyScroll(open);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()} modal={false}>
      <Dialog.Portal>
        {open ? <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in" /> : null}
        <Dialog.Content
          data-dialog-layer=""
          onPointerDownOutside={(e) => {
            if (ehCamadaDeCima(e.target)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (ehCamadaDeCima(e.target)) e.preventDefault();
          }}
          onFocusOutside={(e) => e.preventDefault()}
          className={cn(
            'fixed z-[151] flex max-h-[92dvh] w-full flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl outline-none dark:border-[#282828] dark:bg-[#121212]',
            'inset-x-0 bottom-0 rounded-t-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
            WIDTHS[maxWidth],
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#242424]">
            <div className="flex min-w-0 items-start gap-3">
              {icon ? <div className="mt-0.5 shrink-0 rounded-xl bg-slate-100 p-2 text-slate-700 dark:bg-white/10 dark:text-white">{icon}</div> : null}
              <div className="min-w-0">
                <Dialog.Title className="text-sm font-extrabold uppercase leading-snug tracking-tight text-slate-900 dark:text-white">{title}</Dialog.Title>
                {subtitle ? <Dialog.Description className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</Dialog.Description> : null}
              </div>
            </div>
            <Dialog.Close className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white" aria-label="Fechar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4">{children}</div>
          {footer ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-[#242424] dark:bg-[#121212]">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Painel lateral (slide-over). Usado para formulários abertos de dentro de
 * outro formulário: fica lado a lado, sem escurecer o que estava sendo preenchido.
 */
export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-xl',
  dim = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  dim?: boolean;
}) {
  useLockBodyScroll(open);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()} modal={false}>
      <Dialog.Portal>
        {open ? <div className={cn('fixed inset-0 z-[160]', dim ? 'bg-slate-900/40 backdrop-blur-[2px]' : 'bg-slate-900/10')} /> : null}
        <Dialog.Content
          data-dialog-layer=""
          onPointerDownOutside={(e) => {
            if (ehCamadaDeCima(e.target)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (ehCamadaDeCima(e.target)) e.preventDefault();
          }}
          onFocusOutside={(e) => e.preventDefault()}
          className={cn(
            'fixed inset-y-0 right-0 z-[161] flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl outline-none dark:border-[#282828] dark:bg-[#121212] data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
            width,
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#242424]">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">{title}</Dialog.Title>
              {subtitle ? <Dialog.Description className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white" aria-label="Fechar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-[#242424]">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
