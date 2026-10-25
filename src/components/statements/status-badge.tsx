import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { isStatementStatus, PROGRESS_CODES, STATEMENT_STATUS_STYLE } from "@/lib/labels";
import { cn } from "@/lib/utils";

const isProgressCode = (p: string): p is (typeof PROGRESS_CODES)[number] => (PROGRESS_CODES as readonly string[]).includes(p);

export function StatusBadge({ status, progress }: { status: string; progress?: string | null }) {
  const tc = useTranslations("common");
  const known = isStatementStatus(status);
  const label = known ? tc(`statementStatus.${status}`) : status;
  const busy = status === "processing" || status === "uploaded";
  const progressLabel = progress ? (isProgressCode(progress) ? tc(`progress.${progress}`) : progress) : null;
  return (
    <Badge variant="secondary" className={cn("gap-1 font-medium", known && STATEMENT_STATUS_STYLE[status])}>
      {busy && <Loader2 className="size-3 animate-spin" />}
      {busy && progressLabel ? progressLabel : label}
    </Badge>
  );
}
