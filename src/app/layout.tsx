import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BullBoard · Gestor de colas Bull y BullMQ",
  description:
    "Panel accesible y minimalista para gestionar colas Bull y BullMQ, con actualización automática configurable que no satura Redis. Funciona sin conexión a internet.",
};

// Sin maximum-scale: el usuario puede hacer zoom con dos dedos (WCAG 1.4.4)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111827",
};

// Aplica preferencias de accesibilidad antes del primer pintado (evita saltos de tamaño)
const PREFS_SCRIPT = `try{var p=JSON.parse(localStorage.getItem('bullboard:prefs')||'{}'),u=new URLSearchParams(location.search),d=document.documentElement;var f=u.has('font')?Math.max(0,Math.min(4,Number(u.get('font'))||0)):typeof p.fontScale==='number'?p.fontScale:1;var c=u.has('contrast')?u.get('contrast')==='1':!!p.contrast;var m=u.has('motion')?u.get('motion')==='1':!!p.reduceMotion;d.dataset.fs=String(f);d.dataset.contrast=c?'high':'normal';d.dataset.motion=m?'reduce':'normal';}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
