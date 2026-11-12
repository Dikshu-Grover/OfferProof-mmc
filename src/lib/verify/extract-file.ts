// Browser-only text extraction. Import this module dynamically from event handlers.
import { ACCEPTED, MAX_FILE_BYTES } from "./upload-batch";
import type { EvidenceSource } from "./evidence";
export { ACCEPTED, MAX_FILE_BYTES } from "./upload-batch";

export async function extractFromFile(file: File, onProgress?: (p: number, label: string) => void, onEvidence?: (sources: EvidenceSource[]) => void): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Only PDF, JPG or PNG files are supported.");
  if (file.size > MAX_FILE_BYTES) throw new Error("File is larger than 10 MB.");

  if (file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const doc = await loadingTask.promise;
    const pages: string[] = [];
    const n = doc.numPages;
    const sources: EvidenceSource[] = [];
    try {
    for (let i = 1; i <= n; i++) {
      onProgress?.(i / n, `Reading page ${i} of ${n}`);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = "";
      let lastY: number | null = null;
      const out: string[] = [];
      for (const item of content.items as Array<{ str: string; transform: number[] }>) {
        const y = item.transform[5] ?? 0;
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          out.push(line);
          line = "";
        }
        line += `${line ? " " : ""}${item.str}`;
        lastY = y;
      }
      out.push(line);
      let pageText = out.join("\n").trim();
      if (!pageText) {
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error(`Could not read page ${i} of ${file.name}.`);
        await page.render({ canvasContext: context, canvas, viewport }).promise;
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng");
        try {
          const { data } = await worker.recognize(canvas);
          pageText = data.text.trim();
          sources.push({ id: `page-${i}`, name: `${file.name} · page ${i}`, kind: "document", method: "ocr", confidence: data.confidence, text: pageText });
        } finally { await worker.terminate(); canvas.width = 0; canvas.height = 0; }
      } else sources.push({ id: `page-${i}`, name: `${file.name} · page ${i}`, kind: "document", method: "pdf-text", text: pageText });
      if (!pageText) throw new Error(`No text could be read from ${file.name}, page ${i}. No partial report was produced.`);
      pages.push(pageText);
    }
    const text = pages.join("\n\n").trim();
    if (!text) throw new Error("This PDF has no selectable text. Try uploading a screenshot of it instead.");
    onEvidence?.(sources);
    return text;
    } finally { await loadingTask.destroy(); }
  }

  const { createWorker } = await import("tesseract.js");
  const w = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(m.progress, "Recognising text");
    },
  });
  try {
    const { data } = await w.recognize(file);
    onEvidence?.([{ id: "image", name: file.name, kind: "document", method: "ocr", confidence: data.confidence, text: data.text.trim() }]);
    return data.text.trim();
  } finally {
    await w.terminate();
  }
}
