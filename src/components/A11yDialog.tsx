"use client";

import { Dialog } from "./Dialog";
import { Btn } from "./ui";
import { Icon } from "./icons";
import { FONT_SCALES, type Prefs } from "@/hooks/usePrefs";

function Switch({
  id,
  checked,
  onChange,
  label,
  help,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line p-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-semibold">
          {label}
        </label>
        <p id={`${id}-help`} className="mt-0.5 text-xs text-subtle">
          {help}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-help`}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors ${
          checked ? "border-accent bg-accent" : "border-line-strong bg-soft"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

export function A11yDialog({
  prefs,
  update,
  reset,
  onClose,
}: {
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  reset: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      onClose={onClose}
      variant="drawer"
      title="Accesibilidad"
      description="Ajustes guardados en este navegador"
      icon={
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink">
          <Icon name="a11y" size={18} />
        </span>
      }
      footer={
        <>
          <Btn icon="retry" label="Restablecer" onClick={reset} srLabel="Restablecer ajustes de accesibilidad" />
          <span className="min-w-0 flex-1" />
          <Btn icon="check" label="Listo" tone="dark" onClick={onClose} />
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
            <Icon name="type" size={16} /> Tamaño del texto
          </legend>
          <p className="mb-2 text-xs text-subtle">Todo el panel se escala de forma proporcional. También puedes usar el zoom del navegador.</p>
          <div className="grid grid-cols-5 gap-1.5">
            {FONT_SCALES.map((f, i) => {
              const checked = prefs.fontScale === i;
              return (
                <label
                  key={f.pct}
                  className={`flex h-14 cursor-pointer flex-col items-center justify-center rounded-lg border text-center has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus ${
                    checked ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-panel hover:bg-soft"
                  }`}
                >
                  <input
                    type="radio"
                    name="font-scale"
                    value={i}
                    checked={checked}
                    onChange={() => update({ fontScale: i })}
                    className="sr-only"
                  />
                  <span aria-hidden="true" className="font-bold leading-none" style={{ fontSize: `${0.75 + i * 0.18}rem` }}>
                    A
                  </span>
                  <span className="mt-1 text-[0.65rem] leading-none tnum">{f.pct}%</span>
                  <span className="sr-only">{f.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <Switch
          id="pref-contrast"
          checked={prefs.contrast}
          onChange={(v) => update({ contrast: v })}
          label="Alto contraste"
          help="Bordes y textos más oscuros para mejorar la legibilidad."
        />
        <Switch
          id="pref-motion"
          checked={prefs.reduceMotion}
          onChange={(v) => update({ reduceMotion: v })}
          label="Reducir movimiento"
          help="Desactiva animaciones; la barra de refresco avanza a saltos de un segundo."
        />
        <Switch
          id="pref-announce"
          checked={prefs.announce}
          onChange={(v) => update({ announce: v })}
          label="Anunciar actualizaciones automáticas"
          help="El lector de pantalla dirá cuándo se refrescan los datos. Desactivado por defecto para no interrumpir."
        />
        <Switch
          id="pref-shortcuts"
          checked={prefs.shortcuts}
          onChange={(v) => update({ shortcuts: v })}
          label="Atajos de teclado"
          help="Atajos de una sola tecla. Desactívalos si usas control por voz o te molestan."
        />

        <section aria-labelledby="kbd-title" className="rounded-xl border border-line p-3">
          <h3 id="kbd-title" className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="keyboard" size={16} /> Atajos y navegación
          </h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            {[
              ["R", "Actualizar ahora y reiniciar el temporizador"],
              ["/", "Ir al buscador de jobs"],
              ["N", "Crear un job nuevo"],
              ["← →", "Cambiar de estado en las pestañas"],
              ["Esc", "Cerrar diálogos"],
              ["Tab", "Recorrer controles en orden lógico"],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="inline-block min-w-8 rounded border border-line-strong bg-soft px-1.5 py-0.5 text-center font-mono font-semibold">{k}</kbd>
                </dt>
                <dd className="self-center text-muted">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-subtle">
            {prefs.shortcuts ? "Los atajos de una tecla están activados." : "Los atajos de una tecla están desactivados."}
          </p>
        </section>
      </div>
    </Dialog>
  );
}
