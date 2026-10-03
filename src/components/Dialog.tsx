"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Btn } from "./ui";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

// Pila de diálogos abiertos: solo el superior gestiona Escape y Tab
const stack: string[] = [];

function setShellInert(on: boolean) {
  const shell = document.getElementById("app-shell");
  if (!shell) return;
  if (on) shell.setAttribute("inert", "");
  else shell.removeAttribute("inert");
}

/**
 * Diálogo modal accesible:
 * - role="dialog"/"alertdialog", aria-modal, aria-labelledby/aria-describedby
 * - Foco inicial, foco atrapado con Tab/Shift+Tab, Escape para cerrar
 * - Devuelve el foco al elemento que lo abrió
 * - El resto de la app queda `inert` (no navegable ni leído)
 */
export function Dialog({
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  variant = "center",
  role = "dialog",
  initialFocus,
}: {
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  variant?: "center" | "drawer" | "small";
  role?: "dialog" | "alertdialog";
  initialFocus?: string;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    stack.push(id);
    setShellInert(true);
    const node = panel.current;
    const target =
      (initialFocus ? node?.querySelector<HTMLElement>(initialFocus) : null) ||
      node?.querySelector<HTMLElement>("[data-autofocus]") ||
      node?.querySelector<HTMLElement>(FOCUSABLE);
    (target || node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && node) {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        );
        if (!items.length) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) setShellInert(false);
      if (prev && document.contains(prev)) prev.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrap =
    variant === "drawer"
      ? "fixed inset-0 z-50 flex justify-end bg-black/40"
      : "fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4";
  const box =
    variant === "drawer"
      ? "flex h-full w-full flex-col bg-panel shadow-2xl sm:max-w-md sm:rounded-l-2xl"
      : variant === "small"
        ? "flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-panel shadow-2xl sm:max-w-sm sm:rounded-2xl"
        : "flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-panel shadow-2xl sm:max-w-lg sm:rounded-2xl";

  return (
    <div
      className={wrap}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`${box} overflow-hidden outline-none`}
      >
        <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line px-4 py-2">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-bold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="truncate text-xs text-subtle">
                {description}
              </p>
            )}
          </div>
          <Btn icon="x" size="sm" srLabel="Cerrar diálogo" title="Cerrar (Escape)" onClick={() => onCloseRef.current()} />
        </div>
        {children && <div className="stable-scroll min-h-0 flex-1 overflow-y-auto p-4">{children}</div>}
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Confirmación accesible (alertdialog). El foco inicial va a "Cancelar" por seguridad. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      onClose={onCancel}
      title={title}
      variant="small"
      role="alertdialog"
      initialFocus="[data-cancel]"
      footer={
        <>
          <span className="min-w-0 flex-1" />
          <Btn icon="x" label="Cancelar" onClick={onCancel} data-cancel="" />
          <Btn icon={danger ? "trash" : "check"} label={confirmLabel} tone={danger ? "danger" : "dark"} onClick={onConfirm} />
        </>
      }
    >
      <p className="text-sm text-muted">{message}</p>
    </Dialog>
  );
}
