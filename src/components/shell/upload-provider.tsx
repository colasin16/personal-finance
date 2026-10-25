"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { UploadResult } from "@/app/api/statements/route";

type UploadContextValue = {
  upload: (files: File[], accountId?: string | null) => Promise<UploadResult[]>;
  uploading: boolean;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside <UploadProvider>");
  return ctx;
}

const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

/** Statements can be dropped anywhere in the app (Summ-style "just drop your files"). */
export function UploadProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("import.upload");
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const upload = useCallback(
    async (files: File[], accountId?: string | null) => {
      const pdfs = files.filter(isPdf);
      const skipped = files.length - pdfs.length;
      if (skipped > 0) toast.warning(t("skipped", { count: skipped }));
      if (pdfs.length === 0) return [];
      setUploading(true);
      const id = toast.loading(t("uploading", { count: pdfs.length }));
      try {
        const body = new FormData();
        for (const file of pdfs) body.append("files", file);
        if (accountId) body.append("accountId", accountId);
        const response = await fetch("/api/statements", { method: "POST", body });
        const json = (await response.json()) as { results?: UploadResult[]; error?: string };
        if (!response.ok || !json.results) throw new Error(json.error ?? t("failed"));
        const results = json.results;
        const added = results.filter((r) => r.statementId && !r.duplicate).length;
        const dupes = results.filter((r) => r.duplicate).length;
        const errors = results.filter((r) => r.error);
        toast.success(
          [added && t("added", { count: added }), dupes && t("duplicates", { count: dupes })].filter(Boolean).join(" · ") ||
            t("nothingNew"),
          { id },
        );
        for (const e of errors) toast.error(`${e.fileName}: ${e.error}`);
        router.refresh();
        return results;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("failed"), { id });
        return [];
      } finally {
        setUploading(false);
      }
    },
    [router, t],
  );

  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      // Drop zones on the page handle their own drops (e.g. with a pre-selected account).
      if ((e.target as HTMLElement | null)?.closest?.("[data-dropzone]")) return;
      void upload(Array.from(e.dataTransfer?.files ?? [])).then((r) => {
        if (r.length && window.location.pathname !== "/import") router.push("/import");
      });
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [upload, router]);

  return (
    <UploadContext.Provider value={{ upload, uploading }}>
      {children}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-emerald-600/10 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-emerald-500 bg-background px-12 py-10 shadow-xl">
            <FileUp className="size-10 text-emerald-600" />
            <p className="text-lg font-medium">{t("overlayTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("overlayHint")}</p>
          </div>
        </div>
      )}
    </UploadContext.Provider>
  );
}
