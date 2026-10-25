"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { confirmStatementAction } from "@/lib/actions/statements";
import { Button } from "@/components/ui/button";

export function ConfirmStatementButton({ statementId, flagged }: { statementId: string; flagged: number }) {
  const t = useTranslations("statements.confirm");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      className="bg-emerald-600 hover:bg-emerald-700"
      disabled={pending}
      onClick={() => {
        if (flagged > 0 && !confirm(t("prompt", { count: flagged }))) return;
        start(async () => {
          const result = await confirmStatementAction(statementId);
          if (!result.ok) return void toast.error(result.error);
          toast.success(t("success"));
          router.push("/import");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Check />} {t("button")}
    </Button>
  );
}
