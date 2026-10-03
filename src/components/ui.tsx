import type { ButtonHTMLAttributes, Ref } from "react";
import { Icon, type IconName } from "./icons";

type Tone = "ghost" | "dark" | "danger" | "soft";

const TONES: Record<Tone, string> = {
  ghost: "border-line-strong bg-panel text-ink hover:bg-soft",
  dark: "border-accent bg-accent text-accent-ink hover:opacity-90",
  danger: "border-danger-line bg-danger-bg text-danger hover:brightness-95",
  soft: "border-transparent bg-soft text-ink hover:brightness-95",
};

/**
 * Botón con icono. Objetivos táctiles de 44px en móvil (40px en "sm"), compactos en escritorio.
 * - `label`: texto visible.
 * - `srLabel`: nombre accesible completo (debe CONTENER el texto visible, WCAG 2.5.3).
 *   Obligatorio si el botón es solo icono.
 * - `stack`: icono encima del texto en móvil (barras de acciones en rejilla).
 */
export function Btn({
  icon,
  label,
  srLabel,
  tone = "ghost",
  size = "md",
  stack = false,
  spinning = false,
  className = "",
  title,
  type = "button",
  ref,
  ...rest
}: {
  icon: IconName;
  label?: string;
  srLabel?: string;
  tone?: Tone;
  size?: "md" | "sm";
  stack?: boolean;
  spinning?: boolean;
  ref?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const iconOnly = !label;
  const sizeCls = stack
    ? "h-14 min-w-0 flex-col gap-1 px-1 text-xs lg:h-8 lg:flex-row lg:gap-1.5 lg:px-2.5"
    : size === "sm"
      ? `h-10 text-xs lg:h-8 ${iconOnly ? "w-10 lg:w-8" : "gap-1.5 px-2.5"}`
      : `h-11 text-sm lg:h-9 ${iconOnly ? "w-11 lg:w-9" : "gap-2 px-3"}`;
  return (
    <button
      ref={ref}
      type={type}
      title={title ?? srLabel ?? label}
      aria-label={srLabel}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${TONES[tone]} ${sizeCls} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" || stack ? 15 : 17} spin={spinning} />
      {label && <span className="max-w-full truncate whitespace-nowrap">{label}</span>}
    </button>
  );
}

/* ── Formato numérico: abreviado visible, completo para lectores de pantalla ── */
export function fmtShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + " M";
  if (n >= 10_000) return (n / 1000).toFixed(1).replace(".", ",") + " k";
  return n.toLocaleString("es-ES");
}

export function Num({ n }: { n: number }) {
  const short = fmtShort(n);
  const full = n.toLocaleString("es-ES");
  if (short === full) return <>{full}</>;
  return (
    <>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{full}</span>
    </>
  );
}

/* ── Fechas relativas: corta visible, larga para lectores ── */
export function agoParts(ts: number | null): { short: string; long: string } {
  if (!ts) return { short: "—", long: "sin fecha" };
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (s < 60) return { short: `hace ${s} s`, long: `hace ${plural(s, "segundo", "segundos")}` };
  const m = Math.floor(s / 60);
  if (m < 60) return { short: `hace ${m} min`, long: `hace ${plural(m, "minuto", "minutos")}` };
  const h = Math.floor(m / 60);
  if (h < 24) return { short: `hace ${h} h`, long: `hace ${plural(h, "hora", "horas")}` };
  const d = Math.floor(h / 24);
  return { short: `hace ${d} d`, long: `hace ${plural(d, "día", "días")}` };
}

export function fmtDate(ts: number | null): string {
  if (!ts) return "Sin fecha";
  return new Date(ts).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "medium" });
}

export function Ago({ ts, className = "" }: { ts: number | null; className?: string }) {
  const p = agoParts(ts);
  if (!ts)
    return (
      <span className={className}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">sin fecha</span>
      </span>
    );
  return (
    <time dateTime={new Date(ts).toISOString()} title={fmtDate(ts)} className={className}>
      <span aria-hidden="true">{p.short}</span>
      <span className="sr-only">{p.long}</span>
    </time>
  );
}

/* ── Metadatos de estado: etiqueta en español + colores con contraste AA ── */
export const STATE_META: Record<string, { label: string; dot: string; cls: string }> = {
  waiting: { label: "En espera", dot: "#2563eb", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  active: { label: "Activo", dot: "#d97706", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  delayed: { label: "Retrasado", dot: "#7c3aed", cls: "bg-violet-50 text-violet-800 border-violet-200" },
  completed: { label: "Completado", dot: "#059669", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  failed: { label: "Fallido", dot: "#dc2626", cls: "bg-red-50 text-red-800 border-red-200" },
  paused: { label: "Pausado", dot: "#6b7280", cls: "bg-gray-100 text-gray-800 border-gray-300" },
  unknown: { label: "Desconocido", dot: "#6b7280", cls: "bg-gray-100 text-gray-800 border-gray-300" },
};

export function stateMeta(s: string) {
  return STATE_META[s] || STATE_META.unknown;
}

export function StateBadge({ state, className = "" }: { state: string; className?: string }) {
  const m = stateMeta(state);
  return (
    <span className={`inline-flex h-6 w-24 shrink-0 items-center justify-center gap-1.5 rounded-full border px-2 text-xs font-semibold ${m.cls} ${className}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.dot }} />
      <span className="truncate">{m.label}</span>
    </span>
  );
}

export function ProgressMini({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-soft"
      >
        <span className="block h-full rounded-full bg-accent" style={{ width: `${v}%` }} />
      </span>
      <span aria-hidden="true" className="w-10 shrink-0 text-right text-xs tnum">
        {v}%
      </span>
    </span>
  );
}
