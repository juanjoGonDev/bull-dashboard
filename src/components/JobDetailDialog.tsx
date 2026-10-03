"use client";

import { Dialog } from "./Dialog";
import { Btn, StateBadge, fmtDate, ProgressMini } from "./ui";
import { Icon } from "./icons";
import type { JobDetail } from "@/lib/types";

export function JobDetailDialog({
  id,
  queue,
  job,
  loading,
  busy,
  onClose,
  onAction,
}: {
  id: string;
  queue: string;
  job: JobDetail | null;
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onAction: (action: "retry" | "promote" | "fail" | "remove") => void;
}) {
  return (
    <Dialog
      onClose={onClose}
      variant="drawer"
      title={`Job #${id}`}
      description={`Cola ${queue}`}
      icon={
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-soft text-ink">
          <Icon name="eye" size={17} />
        </span>
      }
      footer={
        <div className="grid w-full grid-cols-4 gap-2 sm:flex">
          <Btn icon="retry" label="Reintentar" stack srLabel={`Reintentar job ${id}`} onClick={() => onAction("retry")} disabled={busy || !job} />
          <Btn icon="zap" label="Promover" stack srLabel={`Promover job ${id}: quitar retraso y procesar ya`} onClick={() => onAction("promote")} disabled={busy || !job} />
          <Btn icon="ban" label="Fallar" stack srLabel={`Marcar job ${id} como fallido`} onClick={() => onAction("fail")} disabled={busy || !job} />
          <span className="hidden min-w-0 flex-1 sm:block" />
          <Btn icon="trash" label="Borrar" stack tone="danger" srLabel={`Borrar job ${id}`} onClick={() => onAction("remove")} disabled={busy || !job} />
        </div>
      }
    >
      <div aria-busy={loading} aria-live="polite">
        {loading || !job ? (
          <div className="flex flex-col gap-3">
            <span className="sr-only">Cargando detalle del job…</span>
            <div className="skeleton h-6 w-1/2" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-16 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="max-w-full truncate rounded-full bg-soft px-3 py-1 text-sm font-semibold">{job.name}</span>
              <StateBadge state={job.state} />
            </div>
            <ProgressMini value={job.progress} label={`Progreso del job ${job.id}`} />
            <dl className="grid grid-cols-2 gap-2">
              {[
                ["Creado", fmtDate(job.timestamp)],
                ["Terminado", fmtDate(job.finishedOn)],
                ["Intentos realizados", String(job.attemptsMade)],
                ["Cola", queue],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0 rounded-lg border border-line bg-bg p-2.5">
                  <dt className="truncate text-xs text-subtle">{k}</dt>
                  <dd className="mt-0.5 break-words text-sm font-semibold tnum">{v}</dd>
                </div>
              ))}
            </dl>
            {job.failedReason && (
              <section aria-labelledby="err-title" className="rounded-lg border border-danger-line bg-danger-bg p-3">
                <h3 id="err-title" className="flex items-center gap-1.5 text-sm font-bold text-danger">
                  <Icon name="alert" size={15} /> Motivo del fallo
                </h3>
                <p className="mt-1 break-words text-sm text-danger">{job.failedReason}</p>
                {job.stacktrace && job.stacktrace.length > 0 && (
                  <pre
                    tabIndex={0}
                    aria-label="Traza del error"
                    className="stable-scroll mt-2 max-h-32 overflow-auto rounded bg-[#111827] p-2 font-mono text-xs leading-relaxed text-[#e5e7eb]"
                  >
                    {job.stacktrace.join("\n")}
                  </pre>
                )}
              </section>
            )}
            <section aria-labelledby="payload-title">
              <h3 id="payload-title" className="text-sm font-bold">
                Datos del job
              </h3>
              <pre
                tabIndex={0}
                aria-label="Datos del job en formato JSON"
                className="stable-scroll mt-1.5 max-h-56 overflow-auto rounded-lg border border-line bg-[#0f141b] p-3 font-mono text-xs leading-relaxed text-[#d1fae5]"
              >
                {JSON.stringify(job.data, null, 2)}
              </pre>
            </section>
            {job.raw && (
              <details className="rounded-lg border border-line">
                <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-muted">Ver hash crudo en Redis</summary>
                <pre tabIndex={0} aria-label="Hash crudo del job" className="stable-scroll max-h-40 overflow-auto border-t border-line bg-bg p-3 font-mono text-xs">
                  {JSON.stringify(job.raw, null, 2).slice(0, 4000)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
