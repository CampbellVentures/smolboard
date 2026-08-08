import React, { use } from "react";
import type { PageAuth, ServerData, SsrResponse } from "@pylonsync/react";
import { AppShell, type EventNavKey, type WorkspaceNavKey } from "@/components/app-shell";
import type { EventRow } from "@/lib/types";

// `app/dashboard/layout.tsx` wraps every /dashboard page in the three-pane
// shell, so no page repeats the chrome. The layout gates auth for the whole
// section, resolves the chrome's data server-side (user email, org name, and —
// for /dashboard/events/[id]/* — the event row for the event-scoped nav), and
// derives the active nav item + title from the request URL.
interface LayoutProps {
  children: React.ReactNode;
  url: string;
  auth: PageAuth;
  response: SsrResponse;
  serverData: ServerData;
}

const WORKSPACE_TITLES: { key: WorkspaceNavKey; href: string; title: string }[] = [
  { key: "settings", href: "/dashboard/settings", title: "Settings" },
  { key: "members", href: "/dashboard/members", title: "Team" },
  { key: "events", href: "/dashboard/events", title: "Events" },
];

const EVENT_TITLES: { key: EventNavKey; seg: string; title: string }[] = [
  { key: "overview", seg: "overview", title: "Overview" },
  { key: "forms", seg: "forms", title: "Submission forms" },
  { key: "abstracts", seg: "abstracts", title: "Submissions" },
  { key: "agenda", seg: "agenda", title: "Agenda" },
  { key: "speakers", seg: "speakers", title: "Speakers" },
  { key: "tasks", seg: "tasks", title: "Speaker tasks" },
  { key: "emails", seg: "emails", title: "Emails" },
  { key: "event-settings", seg: "settings", title: "Event settings" },
];

export default function DashboardLayout({
  children,
  url,
  auth,
  response,
  serverData,
}: LayoutProps) {
  // Gating here protects the whole /dashboard section: signed-out visitors get
  // a real 307 to /login and no page code runs.
  if (!auth.user_id) {
    response.redirect("/login");
    return null;
  }
  // No active workspace: render bare — /dashboard shows the full-screen
  // ProvisionWorkspace flow; subpages redirect back to /dashboard themselves.
  if (!auth.tenant_id) {
    return <>{children}</>;
  }
  const me = use(
    serverData.get<{ email?: string; displayName?: string }>("User", auth.user_id),
  );
  const org = use(serverData.get<{ name?: string }>("Org", auth.tenant_id));
  const userName =
    me?.displayName?.trim() || me?.email?.split("@")[0]?.trim() || "Organizer";

  const path = (url ?? "").split("?")[0];

  // Event-scoped section: /dashboard/events/<id>[/<section>...]. Resolve the
  // event server-side so the sidebar shows its name; pages below still verify
  // tenant ownership themselves before rendering data.
  const eventMatch = path.match(/^\/dashboard\/events\/([^/]+)(?:\/([^/]+))?/);
  if (eventMatch) {
    const [, eventId, seg] = eventMatch;
    const event = use(serverData.get<EventRow>("Event", eventId));
    if (event && event.orgId === auth.tenant_id) {
      const section = EVENT_TITLES.find((t) => t.seg === seg);
      const title = seg === "forms" && path.split("/").length > 5
        ? "Edit form"
        : section?.title ?? "Submissions";
      return (
        <AppShell
          active={section?.key ?? "overview"}
          title={title}
          userEmail={me?.email ?? ""}
          userId={auth.user_id}
          userName={userName}
          workspaceId={auth.tenant_id}
          orgName={org?.name}
          event={{ id: event.id, name: event.name }}
        >
          {children}
        </AppShell>
      );
    }
    // Unknown/foreign event → fall through to workspace chrome; the page 404s.
  }

  const nav =
    WORKSPACE_TITLES.find((n) => path === n.href || path.startsWith(n.href + "/")) ??
    WORKSPACE_TITLES[WORKSPACE_TITLES.length - 1];
  return (
    <AppShell
      active={nav.key}
      title={nav.title}
      userEmail={me?.email ?? ""}
      userId={auth.user_id}
      userName={userName}
      workspaceId={auth.tenant_id}
      orgName={org?.name}
    >
      {children}
    </AppShell>
  );
}
