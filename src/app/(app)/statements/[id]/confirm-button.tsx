"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { confirmStatementAction } from "@/lib/actions/statements";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ConfirmStatementButton({ statementId, flagged }: { statementId: string; flagged: number }) {
  const t = useTranslations("statements.confirm");
  const tc = useTranslations("common");
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const router = useRouter();

  const confirmStatement = () =>
    start(async () => {
      const result = await confirmStatementAction(statementId);
      if (!result.ok) return void toast.error(result.error);
      setAsking(false);
      toast.success(t("success"));
      router.push("/import");
    });

  return (
    <>
      <Button
        className="bg-emerald-600 hover:bg-emerald-700"
        disabled={pending}
        onClick={() => (flagged > 0 ? setAsking(true) : confirmStatement())}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />} {t("button")}
      </Button>
      <Dialog open={asking} onOpenChange={(open) => !pending && setAsking(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-amber-600" /> {t("promptTitle")}
            </DialogTitle>
            <DialogDescription>{t("prompt", { count: flagged })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsking(false)} disabled={pending}>
              {tc("actions.cancel")}
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={confirmStatement} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} {t("confirmAnyway")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
