"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";
import { Btn } from "./ui";
import { Icon } from "./icons";
import type { QueueInfo } from "@/lib/types";

export function AddJobDialog({
  queues,
  initialQueue,
  onClose,
  onDone,
}: {
  queues: QueueInfo[];
  initialQueue: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [queue, setQueue] = useState(initialQueue || queues[0]?.name || "emails");
  const [name, setName] = useState("send-welcome");
  const [payload, setPayload] = useState('{\n  "to": "user@ejemplo.es",\n  "subject": "Bienvenido"\n}');
  const [delay, setDelay] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: "queue" | "payload" | "general"; msg: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const q = queue.trim();
    if (!q) {
      setErr({ field: "queue", msg: "Escribe el nombre de una cola." });
      document.getElementById("add-queue")?.focus();
      return;
    }
    let data: Record<string, unknown>;
    try {
      data = payload.trim() ? JSON.parse(payload) : {};
    } catch {
      setErr({ field: "payload", msg: "Los datos no son JSON válido. Revisa comillas y llaves." });
      document.getElementById("add-payload")?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/queues/${encodeURIComponent(q)}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "manual", data, delay: Number(delay) || 0 }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      onDone(`Job ${r.id} creado en la cola ${q}`);
    } catch (e2) {
      setErr({ field: "general", msg: e2 instanceof Error ? e2.message : "No se pudo crear el job." });
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "mt-1 h-11 w-full rounded-lg border border-line-strong bg-panel px-3 text-sm aria-[invalid=true]:border-danger lg:h-10";

  return (
    <Dialog
      onClose={onClose}
      title="Nuevo job"
      description="Añade un trabajo a una cola existente o nueva"
      initialFocus="#add-queue"
      icon={
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink">
          <Icon name="plus" size={16} />
        </span>
      }
      footer={
        <>
          <Btn icon="x" label="Cancelar" onClick={onClose} />
          <span className="min-w-0 flex-1" />
          <Btn
            icon="plus"
            label={busy ? "Creando…" : "Crear job"}
            tone="dark"
            type="submit"
            form="add-job-form"
            disabled={busy}
            spinning={busy}
            aria-busy={busy}
          />
        </>
      }
    >
      <form id="add-job-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <label htmlFor="add-queue" className="text-sm font-semibold">
            Cola <span className="font-normal text-subtle">(obligatorio)</span>
          </label>
          <input
            id="add-queue"
            list="add-queue-list"
            value={queue}
            onChange={(e) => setQueue(e.target.value)}
            required
            aria-required="true"
            autoComplete="off"
            aria-invalid={err?.field === "queue"}
            aria-describedby={`add-queue-help${err?.field === "queue" ? " add-err" : ""}`}
            className={inputCls}
          />
          <datalist id="add-queue-list">
            {queues.map((q) => (
              <option key={q.name} value={q.name} />
            ))}
          </datalist>
          <p id="add-queue-help" className="mt-1 text-xs text-subtle">
            Elige una de la lista o escribe un nombre nuevo para crearla.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor="add-name" className="text-sm font-semibold">
              Nombre del job
            </label>
            <input id="add-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={inputCls} />
          </div>
          <div className="min-w-0">
            <label htmlFor="add-delay" className="text-sm font-semibold">
              Retraso en milisegundos
            </label>
            <input
              id="add-delay"
              value={delay}
              onChange={(e) => setDelay(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              aria-describedby="add-delay-help"
              className={`${inputCls} tnum`}
            />
            <p id="add-delay-help" className="mt-1 text-xs text-subtle">
              0 = se procesa en cuanto haya un worker libre.
            </p>
          </div>
        </div>
        <div>
          <label htmlFor="add-payload" className="text-sm font-semibold">
            Datos del job (JSON)
          </label>
          <textarea
            id="add-payload"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={7}
            spellCheck={false}
            aria-invalid={err?.field === "payload"}
            aria-describedby={err?.field === "payload" ? "add-err" : undefined}
            className="stable-scroll mt-1 w-full rounded-lg border border-line-strong bg-[#0f141b] p-3 font-mono text-sm leading-relaxed text-[#d1fae5] aria-[invalid=true]:border-danger"
          />
        </div>
        {/* espacio reservado para el error: no desplaza al aparecer */}
        <p id="add-err" role="alert" className="flex min-h-6 items-center gap-1.5 text-sm font-medium text-danger">
          {err && <Icon name="alert" size={15} />}
          {err?.msg ?? ""}
        </p>
      </form>
    </Dialog>
  );
}
