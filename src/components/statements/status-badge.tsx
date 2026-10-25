import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATEMENT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, progress }: { status: string; progress?: string | null }) {
  const meta = STATEMENT_STATUS[status] ?? { label: status, className: "" };
  const busy = status === "processing" || status === "uploaded";
  return (
    <Badge variant="secondary" className={cn("gap-1 font-medium", meta.className)}>
      {busy && <Loader2 className="size-3 animate-spin" />}
      {busy && progress ? progress : meta.label}
    </Badge>
  );
}
