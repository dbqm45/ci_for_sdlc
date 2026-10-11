import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';

/**
 * Centered modal built on the native <dialog> (showModal): the browser provides the
 * backdrop, focus trap, inert page and Esc-to-close; we only style it.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      // the native dialog focuses its first control (the × button); prefer the marked field
      dlg.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // click on the backdrop (outside the panel) closes
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-panel">
          <div className="modal-head">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="btn ghost sm modal-close" aria-label="Close" onClick={onClose}>
              <CloseIcon size={16} />
            </button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
