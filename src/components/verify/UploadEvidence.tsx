import { useEffect, useRef, useState } from "react";
import { FileText, FileUp, Loader2, Plus, ScanSearch, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { extractUploadBatch, validateUploadBatch } from "@/lib/verify/upload-batch";
import type { EvidenceSource } from "@/lib/verify/evidence";

type Selection = { id: number; file: File; preview: string | null };

export function UploadEvidence({ onText, onBusy, onPending, onSources }: {
  onText: (text: string) => void;
  onBusy: (busy: boolean) => void;
  onPending: (pending: boolean) => void;
  onSources?: (sources: EvidenceSource[]) => void;
}) {
  const [files, setFiles] = useState<Selection[]>([]);
  const [busy, setBusy] = useState<{ p: number; label: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const nextId = useRef(0);
  const processing = useRef(false);

  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);

  function add(incoming: File[]) {
    if (processing.current || !incoming.length) return;
    try {
      validateUploadBatch([...files.map((entry) => entry.file), ...incoming]);
      const entries = incoming.map((file) => {
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
        if (preview) urls.current.add(preview);
        return { id: nextId.current++, file, preview };
      });
      setFiles((current) => [...current, ...entries]);
      onPending(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add these files."); }
  }

  function remove(entry: Selection) {
    if (processing.current) return;
    if (entry.preview) { URL.revokeObjectURL(entry.preview); urls.current.delete(entry.preview); }
    const remaining = files.filter((file) => file.id !== entry.id);
    setFiles(remaining);
    if (!remaining.length) { onText(""); onSources?.([]); }
    onPending(remaining.length > 0);
  }

  async function read() {
    if (processing.current || !files.length) return;
    processing.current = true;
    setBusy({ p: 0, label: "Preparing" });
    onBusy(true);
    try {
      const { extractFromFile } = await import("@/lib/verify/extract-file");
      const sources: EvidenceSource[] = [];
      const text = await extractUploadBatch(files.map((entry) => entry.file), (file, progress) => extractFromFile(file, progress, (parts) => sources.push(...parts)), (p, label) => setBusy({ p, label }));
      onText(text);
      onSources?.(sources.map((source, index) => ({ ...source, id: `source-${index + 1}` })));
      onPending(false);
      toast.success("Text extracted. Review it below, then run the check.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read these files.");
    } finally { processing.current = false; setBusy(null); onBusy(false); }
  }

  return (
    <div>
      <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); add(Array.from(event.dataTransfer.files)); }}
        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:border-primary sm:p-10">
        <FileUp className="size-8 text-primary" />
        <Button variant="ghost" disabled={!!busy} onClick={() => input.current?.click()}>{files.length ? <Plus /> : <FileUp />}{files.length ? "Add files" : "Drop files or browse"}</Button>
        <span className="text-xs text-muted-foreground">One PDF or up to 10 JPG / PNG images · 10 MB per file</span>
        <input ref={input} aria-label="Upload offer evidence" type="file" accept="application/pdf,image/png,image/jpeg" multiple className="sr-only" disabled={!!busy}
          onChange={(event) => { add(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      </div>
      {files.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">{files.length} file(s) · One offer</p>
          <ul aria-label="Selected evidence" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {files.map((entry) => (
              <li key={entry.id} className="relative min-w-0 overflow-hidden rounded-lg border bg-muted/50">
                <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                  {entry.preview ? <img src={entry.preview} alt={entry.file.name} className="h-full w-full object-contain" /> : <FileText className="size-10 text-primary" />}
                </div>
                <p className="truncate p-2 pr-10 text-xs" title={entry.file.name}>{entry.file.name}</p>
                <Button variant="outline" size="icon" className="absolute right-1 top-1 size-7" aria-label={`Remove ${entry.file.name}`} title={`Remove ${entry.file.name}`} disabled={!!busy} onClick={() => remove(entry)}><X /></Button>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="w-full" disabled={!!busy} onClick={read}><ScanSearch />Read selected files</Button>
        </div>
      )}
      {busy && <div className="mt-4" role="status"><p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />{busy.label}…</p><Progress value={busy.p * 100} className="mt-2" /></div>}
    </div>
  );
}