import { Logo } from "@/components/brand/logo";
import { LanguageSwitch } from "@/components/theme/language-switch";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LegalLinks } from "@/components/legal/legal-page";
import { Card } from "@/components/ui/card";

/** The centred card layout of the signed-out pages (sign in, email link confirmation). */
export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <LanguageSwitch />
        <ThemeToggle />
      </div>
      <Logo className="text-lg" />
      <Card className="w-full max-w-sm">{children}</Card>
      <LegalLinks />
    </main>
  );
}
