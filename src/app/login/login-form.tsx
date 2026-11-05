"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, ArrowRight, KeyRound, Loader2, RotateCw, Sparkles, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { signIn, signInDemo, verifyEmailCode, type SignInState } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type Props = {
  next?: string;
  /** "supabase": emails a one-time code (and link). "mock": signs in straight away (offline development). */
  mode: "supabase" | "mock";
  demoEnabled: boolean;
  linkError?: boolean;
};

/**
 * Email-first sign-in, the same for new and returning users: enter your email; if there's no
 * account yet, enter your name; then enter the code we email you.
 */
export function LoginForm(props: Props) {
  // Remounting starts over from the email step ("Use a different email").
  const [attempt, setAttempt] = useState(0);
  return <Flow key={attempt} {...props} onRestart={() => setAttempt((a) => a + 1)} />;
}

function Flow({ next, mode, demoEnabled, linkError, onRestart }: Props & { onRestart: () => void }) {
  const [state, action, pending] = useActionState(signIn, null);
  if (state?.step === "code" && state.email) {
    return <CodeStep email={state.email} name={state.name} isNew={Boolean(state.isNew)} next={next} onRestart={onRestart} />;
  }
  if (state?.step === "name" && state.email) {
    return <NameStep state={state} action={action} pending={pending} next={next} onRestart={onRestart} />;
  }
  return <EmailStep state={state} action={action} pending={pending} next={next} mode={mode} demoEnabled={demoEnabled} linkError={linkError && !state} />;
}

type StepProps = { state: SignInState; action: (formData: FormData) => void; pending: boolean; next?: string };

function Header({ title, description }: { title: React.ReactNode; description: React.ReactNode }) {
  return (
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}

function ErrorAlert({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}

function EmailStep({ state, action, pending, next, mode, demoEnabled, linkError }: StepProps & Pick<Props, "mode" | "demoEnabled" | "linkError">) {
  const [demoPending, startDemo] = useTransition();
  const [demoWho, setDemoWho] = useState<"alex" | "sam" | null>(null);
  const t = useTranslations("auth.login");

  return (
    <>
      <Header title={t("title")} description={t("description")} />
      <CardContent className="space-y-6">
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next ?? ""} />
          {linkError && (
            <Alert variant="destructive">
              <AlertDescription>{t("linkInvalid")}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              defaultValue={state?.email}
              autoComplete="email"
              required
              autoFocus
            />
          </div>
          <ErrorAlert error={state?.error} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
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
      </CardContent>
    </>
  );
}

function NameStep({ state, action, pending, next, onRestart }: StepProps & { onRestart: () => void }) {
  const t = useTranslations("auth.login");
  const email = state?.email ?? "";
  return (
    <>
      <Header title={t("newTitle")} description={t.rich("newDescription", { email, b: (c) => <strong className="text-foreground">{c}</strong> })} />
      <CardContent className="space-y-3">
        <form action={action} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="space-y-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" name="name" placeholder={t("namePlaceholder")} defaultValue={state?.name} autoComplete="given-name" maxLength={60} required autoFocus />
          </div>
          <ErrorAlert error={state?.error} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
            {t("createAccount")}
          </Button>
        </form>
        <Button variant="ghost" size="sm" className="w-full" onClick={onRestart}>
          <ArrowLeft /> {t("useDifferentEmail")}
        </Button>
      </CardContent>
    </>
  );
}

/** Supabase's email OTP length (Authentication → Providers → Email). */
const CODE_LENGTH = 8;
/** Supabase allows one sign-in email per address every 60 seconds by default. */
const RESEND_AFTER_SECONDS = 60;

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return [left, () => setLeft(seconds)] as const;
}

function CodeStep({ email, name, isNew, next, onRestart }: { email: string; name?: string; isNew: boolean; next?: string; onRestart: () => void }) {
  const [state, action, pending] = useActionState(verifyEmailCode, null);
  const [resent, resend, resending] = useActionState(signIn, null);
  const [code, setCode] = useState("");
  const [handled, setHandled] = useState({ state, resent });
  const [resendIn, restartCountdown] = useCountdown(RESEND_AFTER_SECONDS);
  const form = useRef<HTMLFormElement>(null);
  // A wrong code is cleared so the next one can be typed straight away; a new code restarts the wait.
  if (state !== handled.state || resent !== handled.resent) {
    setHandled({ state, resent });
    if (state !== handled.state && state?.error) setCode("");
    if (resent !== handled.resent && resent?.step === "code") restartCountdown();
  }
  const t = useTranslations("auth.login");
  const invalid = state?.error ? true : undefined;
  const half = CODE_LENGTH / 2;

  return (
    <>
      <Header
        title={isNew ? t("codeTitleNew") : t("codeTitleReturning")}
        description={t.rich("codeDescription", { email, length: CODE_LENGTH, b: (c) => <strong className="text-foreground">{c}</strong> })}
      />
      <CardContent className="space-y-4">
        <form ref={form} action={action} className="space-y-3">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="space-y-2">
            <Label htmlFor="code" className="sr-only">
              {t("code")}
            </Label>
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
              aria-invalid={invalid}
              required
              autoFocus
            >
              {[0, half].map((start, group) => (
                <div key={start} className="contents">
                  {group > 0 && <InputOTPSeparator />}
                  <InputOTPGroup>
                    {Array.from({ length: half }, (_, i) => (
                      <InputOTPSlot key={i} index={start + i} className="size-9 text-base sm:size-11 sm:text-lg" aria-invalid={invalid} />
                    ))}
                  </InputOTPGroup>
                </div>
              ))}
            </InputOTP>
          </div>
          <ErrorAlert error={state?.error} />
          <Button type="submit" className="w-full" disabled={pending || code.length < CODE_LENGTH}>
            {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {isNew ? t("verifyNew") : t("verifyReturning")}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">{t("codeHelp")}</p>
        <form action={resend} className="space-y-2 text-center">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="name" value={name ?? ""} />
          <input type="hidden" name="next" value={next ?? ""} />
          <Button type="submit" variant="outline" size="sm" className="w-full" disabled={resending || resendIn > 0}>
            {resending ? <Loader2 className="animate-spin" /> : <RotateCw />}
            {resendIn > 0 ? t("resendIn", { seconds: resendIn }) : t("resend")}
          </Button>
          {resent?.error ? (
            <p className="text-xs text-destructive">{resent.error}</p>
          ) : (
            resent?.step === "code" && <p className="text-xs text-muted-foreground" role="status">{t("resent")}</p>
          )}
        </form>
        <Button variant="ghost" size="sm" className="w-full" onClick={onRestart}>
          <ArrowLeft /> {t("useDifferentEmail")}
        </Button>
      </CardContent>
    </>
  );
}
