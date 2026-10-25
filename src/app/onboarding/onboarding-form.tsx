"use client";

import { useActionState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { acceptInviteAction, createHouseholdAction } from "@/lib/actions/household";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateHouseholdForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState(createHouseholdAction, null);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Household name</Label>
        <Input id="name" name="name" defaultValue={defaultName} required maxLength={80} />
      </div>
      {state && !state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Create household
      </Button>
    </form>
  );
}

export function AcceptInviteButton({ token, label = "Join" }: { token: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await acceptInviteAction(token);
          if (result && !result.ok) toast.error(result.error);
        })
      }
    >
      {pending && <Loader2 className="animate-spin" />}
      {label}
    </Button>
  );
}
