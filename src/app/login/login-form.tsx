"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowLeft, KeyRound, Loader2, Mail, MailCheck, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { signIn, signInDemo, verifyEmailCode } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type Props = {
  next?: string;
  /** "supabase": emails a link and code. "mock": signs in straight away (offline development). */
  mode: "supabase" | "mock";
  demoEnabled: boolean;
  linkError?: boolean;
};

export function LoginForm(props: Props) {
  // Remounting resets the email step's action state ("Use a different email").
  const [attempt, setAttempt] = useState(0);
  return <EmailStep key={attempt} {...props} onRestart={() => setAttempt((a) => a + 1)} />;
}

function EmailStep({ next, mode, demoEnabled, linkError, onRestart }: Props & { onRestart: () => void }) {
  const [state, action, pending] = useActionState(signIn, null);
  const [demoPending, startDemo] = useTransition();
  const t = useTranslations("auth.login");

  if (state?.sentTo) return <CodeStep email={state.sentTo} next={next} onRestart={onRestart} />;

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        {linkError && !state && (
          <Alert variant="destructive">
            <AlertDescription>{t("linkInvalid")}</AlertDescription>
          </Alert>
        )}
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
        {mode === "mock" && <p className="text-center text-xs text-muted-foreground">{t("mockNotice")}</p>}
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

function CodeStep({ email, next, onRestart }: { email: string; next?: string; onRestart: () => void }) {
  const [state, action, pending] = useActionState(verifyEmailCode, null);
  const t = useTranslations("auth.login");

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="size-5" />
        </span>
        <p className="font-medium">{t("checkEmailTitle")}</p>
        <p className="text-sm text-muted-foreground">{t.rich("checkEmailDescription", { email, b: (c) => <strong className="text-foreground">{c}</strong> })}</p>
      </div>
      <form action={action} className="space-y-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="code">{t("code")}</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6,10}"
            maxLength={10}
            placeholder="123456"
            className="text-center font-mono tracking-[0.3em]"
            required
            autoFocus
          />
        </div>
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {t("verify")}
        </Button>
      </form>
      <Button variant="ghost" size="sm" className="w-full" onClick={onRestart}>
        <ArrowLeft /> {t("useDifferentEmail")}
      </Button>
    </div>
  );
}
