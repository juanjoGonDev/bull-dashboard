// Sistema de iconos LOCAL, sin internet, sin dependencias.
// API estilo "font icons": <Icon name="refresh" /> hereda color/tamaño via currentColor.
// Cada icono ocupa una caja fija (w/h) para evitar desplazamientos de layout.
import type { SVGProps } from "react";

export type IconName =
  | "grid"
  | "layers"
  | "refresh"
  | "pause"
  | "play"
  | "trash"
  | "broom"
  | "retry"
  | "plus"
  | "search"
  | "x"
  | "clock"
  | "alert"
  | "check"
  | "chevl"
  | "chevr"
  | "chevd"
  | "db"
  | "pulse"
  | "sliders"
  | "zap"
  | "inbox"
  | "eye"
  | "dot"
  | "ban"
  | "a11y"
  | "contrast"
  | "keyboard"
  | "type"
  | "info";

const PATHS: Record<IconName, React.ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11A8 8 0 0 0 5.6 6.6L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.4 4.4L20 16" />
      <path d="M20 21v-5h-5" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </>
  ),
  play: <path d="M7 4.5v15l13-7.5-13-7.5Z" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  broom: (
    <>
      <path d="m13 11 8-8" />
      <path d="M4 20c2 0 4-1 5.5-2.5L19 8l-3-3L6.5 14.5C5 16 4 18 4 20Z" />
      <path d="M4 20l3-3" />
    </>
  ),
  retry: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12M18 6 6 18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9.5V14" />
      <path d="M12 17.2v.3" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  chevl: <path d="m14.5 5.5-7 6.5 7 6.5" />,
  chevr: <path d="m9.5 5.5 7 6.5-7 6.5" />,
  chevd: <path d="m5.5 9.5 6.5 7 6.5-7" />,
  db: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
      <path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13" />
      <path d="M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8" />
    </>
  ),
  pulse: (
    <>
      <path d="M3 12h4l2.5-6 4 12L16 12h5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </>
  ),
  zap: <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />,
  inbox: (
    <>
      <path d="M3 13 5.5 5h13L21 13v6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19v-6Z" />
      <path d="M3 13h6l1.2 2h3.6L15 13h6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.8 5.8l12.4 12.4" />
    </>
  ),
  a11y: (
    <>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M4.5 8.5c2.5.8 5 1.2 7.5 1.2s5-.4 7.5-1.2" />
      <path d="M12 9.7V14m0 0-3 7m3-7 3 7" />
    </>
  ),
  contrast: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" />
    </>
  ),
  type: (
    <>
      <path d="M3 18 7.5 6 12 18M4.6 14h5.8" />
      <path d="M14 18l3.5-8 3.5 8M15 15.8h5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.2" />
    </>
  ),
};

/**
 * Icono SVG local. El tamaño se expresa en rem (size/16) para que escale
 * junto con el ajuste de tamaño de texto del usuario.
 * - Sin `label`: decorativo (aria-hidden), el texto accesible lo aporta el botón.
 * - Con `label`: role="img" + <title> para lectores de pantalla.
 */
export function Icon({
  name,
  size = 16,
  className = "",
  spin = false,
  label,
  ...rest
}: {
  name: IconName;
  size?: number;
  className?: string;
  spin?: boolean;
  label?: string;
} & SVGProps<SVGSVGElement>) {
  const rem = `${size / 16}rem`;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={`shrink-0 ${spin ? "icon-spin" : ""} ${className}`}
      style={{ width: rem, height: rem, flexShrink: 0 }}
      {...rest}
    >
      {label && <title>{label}</title>}
      {PATHS[name]}
    </svg>
  );
}
