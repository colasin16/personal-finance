"use client";

import { useFormStatus } from "react-dom";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending} autoFocus>
      {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
      {children}
    </Button>
  );
}
