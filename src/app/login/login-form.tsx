"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, KeyRound, Loader2, Mail, MailCheck, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { signIn, signInDemo, verifyEmailCode } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
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
  const [demoWho, setDemoWho] = useState<"alex" | "sam" | null>(null);
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
              <Button
                key={who}
                variant="outline"
                disabled={demoPending}
                onClick={() => {
                  setDemoWho(who);
                  startDemo(() => signInDemo(who));
                }}
              >
                {demoPending && demoWho === who ? <Loader2 className="animate-spin" /> : <Sparkles />}
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

/** Supabase's default email OTP length (Authentication → Providers → Email). */
const CODE_LENGTH = 6;

function CodeStep({ email, next, onRestart }: { email: string; next?: string; onRestart: () => void }) {
  const [state, action, pending] = useActionState(verifyEmailCode, null);
  const [code, setCode] = useState("");
  const [handled, setHandled] = useState(state);
  const form = useRef<HTMLFormElement>(null);
  // A wrong code is cleared so the next one can be typed straight away.
  if (state !== handled) {
    setHandled(state);
    if (state?.error) setCode("");
  }
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
      <form ref={form} action={action} className="space-y-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="code" className="justify-center">{t("code")}</Label>
          <InputOTP
            id="code"
            name="code"
            maxLength={CODE_LENGTH}
            pattern={REGEXP_ONLY_DIGITS}
            value={code}
            onChange={setCode}
            // Submits as soon as the last digit is typed or a code is pasted.
            onComplete={() => form.current?.requestSubmit()}
            disabled={pending}
            autoComplete="one-time-code"
            containerClassName="justify-center"
            aria-invalid={state?.error ? true : undefined}
            required
            autoFocus
          >
            <InputOTPGroup>
              {[0, 1, 2].map((i) => (
                <InputOTPSlot key={i} index={i} className="size-11 text-lg" aria-invalid={state?.error ? true : undefined} />
              ))}
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              {[3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} className="size-11 text-lg" aria-invalid={state?.error ? true : undefined} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={pending || code.length < CODE_LENGTH}>
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
