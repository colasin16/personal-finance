import AuthCodeEmail, { type AuthCodeEmailProps } from "../auth-code";

/** Preview only (`pnpm email:dev`): the sign-up email in Spanish. */
export default function AuthCodeSignUpEs(props: AuthCodeEmailProps) {
  return <AuthCodeEmail {...props} />;
}

AuthCodeSignUpEs.PreviewProps = { ...AuthCodeEmail.PreviewProps, locale: "es", kind: "signup" } satisfies AuthCodeEmailProps;
