import { render } from "react-email";
import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";
import { authEmailFor, verifySendEmailHook, type SendEmailHookPayload } from "@/lib/email/auth-hook";

const payload = (type: string, redirectTo = "https://app.test/auth/callback?next=%2Finvite%2Fabc"): SendEmailHookPayload => ({
  user: { id: "8484b834-f29e-4af2-bf42-80644d154f76", email: "alex@example.com" },
  email_data: { token: "12345678", token_hash: "hash123", redirect_to: redirectTo, email_action_type: type, site_url: "https://supabase.test" },
});

describe("auth emails (Supabase Send Email Hook)", () => {
  it("sends the code and a link that works in any browser, keeping the next page", async () => {
    const email = authEmailFor(payload("magiclink"), "en", "https://app.test")!;
    expect(email.to).toBe("alex@example.com");
    expect(email.subject).toBe("Your Household Finance sign-in code");
    const html = await render(email.react);
    expect(html).toContain("12345678");
    expect(html).toContain("https://app.test/auth/confirm?token_hash=hash123&amp;type=email&amp;next=%2Finvite%2Fabc");
    expect(html).toContain('lang="en"');
  });

  it("sends a localized sign-up confirmation", async () => {
    const email = authEmailFor(payload("signup"), "es", "https://app.test")!;
    expect(email.subject).toBe("Confirma tu email para Finanzas del Hogar");
    const html = await render(email.react);
    expect(html).toContain("Confirmar mi email");
    expect(html).toContain('lang="es"');
  });

  it("skips email types the app doesn't use", () => {
    expect(authEmailFor(payload("recovery"), "en", "https://app.test")).toBeNull();
  });

  it("only accepts requests signed with the hook secret", () => {
    const key = Buffer.from("a-test-secret-of-at-least-32-bytes!!").toString("base64");
    const body = JSON.stringify(payload("email"));
    const id = "msg_1";
    const now = new Date();
    const headers = { "webhook-id": id, "webhook-timestamp": String(Math.floor(now.getTime() / 1000)), "webhook-signature": new Webhook(key).sign(id, now, body) };
    expect(verifySendEmailHook(body, headers, `v1,whsec_${key}`).email_data.token).toBe("12345678");
    const otherKey = Buffer.from("another-secret-of-at-least-32-bytes!").toString("base64");
    expect(() => verifySendEmailHook(body, headers, `v1,whsec_${otherKey}`)).toThrow();
    expect(() => verifySendEmailHook(body.replace("12345678", "00000000"), headers, `v1,whsec_${key}`)).toThrow();
  });
});
