"use client";

import { useActionState, useTransition } from "react";
import { Loader2, Mail, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { signIn, signInDemo } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function LoginForm({ next, demoEnabled }: { next?: string; demoEnabled: boolean }) {
  const [state, action, pending] = useActionState(signIn, null);
  const [demoPending, startDemo] = useTransition();
  const t = useTranslations("auth.login");

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" name="email" type="email" placeholder={t("emailPlaceholder")} autoComplete="email" required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">
            {t("name")} <span className="text-muted-foreground">{t("nameHint")}</span>
          </Label>
          <Input id="name" name="name" placeholder={t("namePlaceholder")} autoComplete="given-name" />
        </div>
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Mail />}
          {t("continue")}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t("mockNotice")}
        </p>
      </form>

      {demoEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> {t("orDemo")} <Separator className="flex-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["alex", "sam"] as const).map((who) => (
              <Button key={who} variant="outline" disabled={demoPending} onClick={() => startDemo(() => signInDemo(who))}>
                {demoPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {t("demoAs", { name: who === "alex" ? "Alex" : "Sam" })}
              </Button>
            ))}
          </div>
          {demoPending && <p className="text-center text-xs text-muted-foreground">{t("demoLoading")}</p>}
        </>
      )}
    </div>
  );
}
