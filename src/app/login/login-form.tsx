"use client";

import { useActionState, useTransition } from "react";
import { Loader2, Mail, Sparkles } from "lucide-react";
import { signIn, signInDemo } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function LoginForm({ next, demoEnabled }: { next?: string; demoEnabled: boolean }) {
  const [state, action, pending] = useActionState(signIn, null);
  const [demoPending, startDemo] = useTransition();

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">
            Your name <span className="text-muted-foreground">(first time only)</span>
          </Label>
          <Input id="name" name="name" placeholder="Alex" autoComplete="given-name" />
        </div>
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Mail />}
          Continue with email
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Offline mode: the magic link is mocked, so you&apos;re signed in straight away.
        </p>
      </form>

      {demoEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> or explore with sample data <Separator className="flex-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["alex", "sam"] as const).map((who) => (
              <Button key={who} variant="outline" disabled={demoPending} onClick={() => startDemo(() => signInDemo(who))}>
                {demoPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Demo as {who === "alex" ? "Alex" : "Sam"}
              </Button>
            ))}
          </div>
          {demoPending && <p className="text-center text-xs text-muted-foreground">Importing 15 sample statements… this takes a few seconds the first time.</p>}
        </>
      )}
    </div>
  );
}
