import type { ReactNode } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './ui';

/** Confirmação de ação perigosa. Avisa que a chave de segurança pode ser pedida. */
export default function ConfirmDangerDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  loading,
  error,
  stepUp = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  error?: string;
  stepUp?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="md"
      icon={<AlertTriangle className="h-4 w-4 text-rose-600" />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] leading-6 text-slate-600 dark:text-[#b3b3b3]">
        <div>{description}</div>
        {stepUp ? (
          <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-[12px] dark:bg-white/[0.04]">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />A chave de segurança pode ser solicitada para confirmar.
          </p>
        ) : null}
        <div aria-live="polite">{error ? <p className="text-[12px] font-medium text-rose-600">{error}</p> : null}</div>
      </div>
    </Modal>
  );
}
