import { getMembers } from "@/lib/households";
import { getIssues } from "@/lib/queries";
import { requireContext } from "@/lib/server/auth";
import { serviceModes } from "@/lib/services/modes";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db, user, household } = await requireContext();
  const [members, issues] = await Promise.all([getMembers(db, household.id), getIssues(db, household.id, user.id)]);
  return (
    <AppShell
      user={{ id: user.id, displayName: user.displayName, email: user.email }}
      household={{ name: household.name }}
      members={members}
      issuesCount={issues.total}
      modes={serviceModes()}
    >
      {children}
    </AppShell>
  );
}
