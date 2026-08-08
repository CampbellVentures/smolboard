"use client";

import React, { useEffect, useState } from "react";
import { Link, useRoom, useRouter, type RoomPeer } from "@pylonsync/react";
import { useAuth, OrganizationSwitcher } from "@pylonsync/client";
import {
  LayoutDashboard,
  CalendarDays,
  FileText,
  Inbox,
  CalendarClock,
  Users,
  Mic2,
  ListChecks,
  Mail,
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
  ArrowLeft,
  Sparkles,
  PanelRightClose,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";

// Three-pane organizer shell (SPEC.md → "Organizer UI shell"):
//   [nav sidebar] [copilot pane] [content]
// Nav is grouped: primary product items first, admin items under an eyebrow
// label, and the account card pinned to the sidebar's base (menu opens
// upward). The copilot pane is a collapsed rail until the agent ships (M3.5).

export type WorkspaceNavKey = "events" | "members" | "settings";
export type EventNavKey =
  | "overview"
  | "forms"
  | "abstracts"
  | "agenda"
  | "speakers"
  | "tasks"
  | "emails"
  | "event-settings";

interface PresencePerson {
  id: string;
  name: string;
}

const PRESENCE_TONES = [
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
] as const;

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function presenceTone(userId: string): string {
  const hash = [...userId].reduce((total, char) => total + char.charCodeAt(0), 0);
  return PRESENCE_TONES[hash % PRESENCE_TONES.length];
}

function peerName(peer: RoomPeer): string {
  const name = typeof peer.data?.name === "string" ? peer.data.name.trim() : "";
  return name || "Organizer";
}

function PresenceIndicator({
  roomId,
  userId,
  userName,
  scopeName,
}: {
  roomId: string;
  userId: string;
  userName: string;
  scopeName: string;
}) {
  const { peers, isConnected, error } = useRoom(roomId, userId, {
    initialPresence: { name: userName },
  });
  const seen = new Set([userId]);
  const collaborators = peers.reduce<PresencePerson[]>((people, peer) => {
    if (seen.has(peer.user_id)) return people;
    seen.add(peer.user_id);
    people.push({ id: peer.user_id, name: peerName(peer) });
    return people;
  }, []);
  const people = [{ id: userId, name: userName }, ...collaborators];
  const visiblePeople = people.slice(0, 4);
  const hiddenCount = people.length - visiblePeople.length;
  const status = error
    ? "Presence unavailable"
    : isConnected
      ? `${people.length} online`
      : "Connecting";
  const title = isConnected
    ? `${people.map((person) => person.name).join(", ")} · ${scopeName}`
    : `${status} · ${scopeName}`;

  return (
    <div
      className="flex h-10 items-center gap-2.5"
      aria-label={`${status} in ${scopeName}`}
      title={title}
      data-presence-room={roomId}
      data-presence-count={isConnected ? people.length : 0}
    >
      <div className="flex -space-x-2" aria-hidden="true">
        {visiblePeople.map((person, index) => (
          <span
            key={person.id}
            className={`relative flex size-8 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-white ${presenceTone(person.id)}`}
            style={{ zIndex: visiblePeople.length - index }}
          >
            {initials(person.name)}
            {index === 0 ? (
              <span
                className={`absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-white ${
                  error ? "bg-amber-400" : isConnected ? "bg-emerald-500" : "bg-zinc-300"
                }`}
              />
            ) : null}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="relative z-0 flex size-8 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold tabular-nums text-zinc-600 ring-2 ring-white">
            +{hiddenCount}
          </span>
        ) : null}
      </div>
      <span className="hidden text-xs font-medium tabular-nums text-zinc-500 lg:inline">
        {status}
      </span>
    </div>
  );
}

interface NavEntry<K extends string> {
  key: K;
  label: string;
  href: string;
  Icon: LucideIcon;
  group?: string;
}

const WORKSPACE_NAV: NavEntry<WorkspaceNavKey>[] = [
  {
    key: "events",
    label: "All events",
    href: "/dashboard",
    Icon: CalendarDays,
    group: "Events",
  },
  { key: "members", label: "Team", href: "/dashboard/members", Icon: Users, group: "Workspace" },
  { key: "settings", label: "Settings", href: "/dashboard/settings", Icon: SettingsIcon, group: "Workspace" },
];

function eventNav(eventId: string): NavEntry<EventNavKey>[] {
  const base = `/dashboard/events/${eventId}`;
  return [
    { key: "overview", label: "Dashboard", href: base, Icon: LayoutDashboard },
    { key: "forms", label: "Forms", href: `${base}/forms`, Icon: FileText, group: "Program" },
    { key: "abstracts", label: "Abstracts", href: `${base}/abstracts`, Icon: Inbox, group: "Program" },
    { key: "agenda", label: "Agenda", href: `${base}/agenda`, Icon: CalendarClock, group: "Program" },
    { key: "speakers", label: "Speakers", href: `${base}/speakers`, Icon: Mic2, group: "Speakers" },
    { key: "tasks", label: "Tasks", href: `${base}/tasks`, Icon: ListChecks, group: "Speakers" },
    { key: "emails", label: "Emails", href: `${base}/emails`, Icon: Mail, group: "Speakers" },
    { key: "event-settings", label: "Settings", href: `${base}/settings`, Icon: SettingsIcon, group: "Event" },
  ];
}

// The active row reads as a raised white card — layered translucent shadows
// instead of a hard border, so it sits naturally on the zinc-50 column.
function NavItem<K extends string>({
  item,
  isActive,
  collapsed,
}: {
  item: NavEntry<K>;
  isActive: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={
        "group relative flex h-10 items-center rounded-xl text-[13px] font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] " +
        (collapsed ? "justify-center px-0 " : "gap-3 px-3 ") +
        (isActive
          ? "bg-zinc-900 text-white shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.16),0_4px_12px_-6px_rgba(0,0,0,0.35)]"
          : "text-zinc-600 hover:bg-white hover:text-zinc-950 hover:shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.05)]")
      }
    >
      <item.Icon
        className={
          "size-[17px] shrink-0 transition-colors duration-150 " +
          (isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-700")
        }
        strokeWidth={2}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function GroupedNav<K extends string>({
  items,
  active,
  collapsed,
  pinnedGroup,
}: {
  items: NavEntry<K>[];
  active: string;
  collapsed: boolean;
  pinnedGroup?: string;
}) {
  const ungrouped = items.filter((n) => !n.group);
  const groups = [...new Set(items.map((n) => n.group).filter(Boolean))] as string[];
  return (
    <nav
      className={
        "flex flex-1 flex-col overflow-y-auto pt-2 " + (collapsed ? "px-2.5" : "px-3")
      }
    >
      <div className="space-y-1">
        {ungrouped.map((n) => (
          <NavItem
            key={n.key}
            item={n}
            isActive={active === n.key}
            collapsed={collapsed}
          />
        ))}
      </div>
      {groups.map((g) => (
        <div
          key={g}
          className={
            g === pinnedGroup
              ? "mt-auto border-t border-zinc-200/80 pb-3 pt-4"
              : collapsed
                ? "mt-3 border-t border-zinc-200/80 pt-3"
                : "mt-5"
          }
        >
          {!collapsed && (
            <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              {g}
            </div>
          )}
          <div className="space-y-1">
            {items
              .filter((n) => n.group === g)
              .map((n) => (
                <NavItem
                  key={n.key}
                  item={n}
                  isActive={active === n.key}
                  collapsed={collapsed}
                />
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  active,
  title,
  userEmail,
  userId,
  userName,
  workspaceId,
  orgName,
  event,
  actions,
  children,
}: {
  active: WorkspaceNavKey | EventNavKey;
  title: string;
  userEmail: string;
  userId: string;
  userName: string;
  workspaceId: string;
  orgName?: string;
  // When set, the sidebar switches to event-scoped nav.
  event?: { id: string; name: string };
  // Right-aligned header controls (e.g. "+ New form").
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const presenceRoomId = event
    ? `smolboard:event:${event.id}`
    : `smolboard:workspace:${workspaceId}`;
  const presenceScopeName = event?.name ?? orgName ?? "this workspace";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem("sb.sidebar.collapsed") === "1");
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem("sb.sidebar.collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-white text-zinc-900">
      {/* ---------- Pane 1: nav sidebar ---------- */}
      <aside
        className={
          "hidden shrink-0 flex-col border-r border-zinc-200/80 bg-zinc-50/90 transition-[width] duration-200 ease-out md:flex " +
          (sidebarCollapsed ? "w-[68px]" : "w-60")
        }
      >
        <div
          className={
            "flex h-14 shrink-0 items-center gap-1.5 " +
            (sidebarCollapsed ? "justify-center px-1.5" : "justify-between px-3")
          }
        >
          {!sidebarCollapsed && (
            <Link
              href="/"
              className="flex h-10 min-w-0 items-center gap-2.5 rounded-xl px-2 transition-[background-color,scale] duration-150 ease-out hover:bg-white active:scale-[0.96]"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
                s
              </span>
              <span className="truncate text-[15px] font-semibold tracking-tight">smolboard</span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-[background-color,color,scale] duration-150 ease-out hover:bg-white hover:text-zinc-800 active:scale-[0.96]"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-[17px]" strokeWidth={2} />
            ) : (
              <PanelLeftClose className="size-[17px]" strokeWidth={2} />
            )}
          </button>
        </div>

        <div className={sidebarCollapsed ? "px-3 pb-2" : "px-3 pb-2"}>
          <OrganizationSwitcher
            hidePersonal
            initialActiveName={orgName}
            onSwitched={() => router.push("/dashboard")}
            className={
              "w-full [&>button]:h-10 [&>button]:w-full [&>button]:rounded-xl [&>button]:border-0 [&>button]:bg-white [&>button]:shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.05)] [&>button]:transition-[background-color,box-shadow,scale] [&>button]:duration-150 [&>button]:ease-out [&>button]:hover:bg-white [&>button]:hover:shadow-[0_0_0_1px_rgba(0,0,0,0.09),0_2px_5px_rgba(0,0,0,0.07)] [&>button]:active:scale-[0.96] [&>button>span:first-child]:size-7 [&>button>span:first-child]:rounded-lg " +
              (sidebarCollapsed
                ? "[&>button]:justify-center [&>button]:px-0 [&>button>span:nth-child(2)]:hidden [&>button>svg]:hidden"
                : "[&>button]:justify-start [&>button]:px-2.5 [&>button>span:nth-child(2)]:min-w-0 [&>button>span:nth-child(2)]:flex-1 [&>button>span:nth-child(2)]:text-left")
            }
          />
        </div>

        {event ? (
          <>
            <div className={"px-3 pt-2 " + (sidebarCollapsed ? "pb-0" : "pb-1")}>
              {sidebarCollapsed ? (
                <Link
                  href="/dashboard"
                  title={`Back to all events · ${event.name}`}
                  className="flex size-10 items-center justify-center rounded-xl bg-white text-zinc-500 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.05)] transition-[color,scale] duration-150 ease-out hover:text-zinc-900 active:scale-[0.96]"
                >
                  <ArrowLeft className="size-[17px]" />
                </Link>
              ) : (
                <div className="rounded-2xl bg-white p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.05)]">
                  <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                    Current event
                  </div>
                  <div className="truncate px-2 text-[13px] font-semibold text-zinc-900">
                    {event.name}
                  </div>
                  <Link
                    href="/dashboard"
                    className="mt-1 flex h-8 items-center gap-2 rounded-lg px-2 text-[12px] font-medium text-zinc-500 transition-[background-color,color,scale] duration-150 ease-out hover:bg-zinc-50 hover:text-zinc-900 active:scale-[0.96]"
                  >
                    <ArrowLeft className="size-3.5" /> All events
                  </Link>
                </div>
              )}
            </div>
            <GroupedNav items={eventNav(event.id)} active={active} collapsed={sidebarCollapsed} />
          </>
        ) : (
          <GroupedNav
            items={WORKSPACE_NAV}
            active={active}
            collapsed={sidebarCollapsed}
            pinnedGroup="Workspace"
          />
        )}

        {/* Account card pinned to the sidebar's base; menu opens upward. */}
        <div className="border-t border-zinc-200/80 p-3">
          <UserMenu email={userEmail} direction="up" collapsed={sidebarCollapsed} />
        </div>
      </aside>

      {/* ---------- Pane 2: copilot ---------- */}
      <CopilotPane />

      {/* ---------- Pane 3: content ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200/70 px-6">
          <h1 className="truncate text-[15px] font-semibold">{title}</h1>
          <div className="flex items-center gap-3">
            {actions}
            <PresenceIndicator
              roomId={presenceRoomId}
              userId={userId}
              userName={userName}
              scopeName={presenceScopeName}
            />
            {/* Sidebar (and its account card) is hidden below md; the top bar
                carries the account menu on small screens only. */}
            <div className="md:hidden">
              <UserMenu email={userEmail} direction="down" />
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}

// Collapsed rail ↔ expanded panel; preference sticks per browser. The panel is
// a teaser until lib/agent-tools.ts + the copilot land (SPEC M3.5).
function CopilotPane() {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    setOpen(localStorage.getItem("sb.copilot.open") === "1");
  }, []);
  function toggle() {
    setOpen((v) => {
      localStorage.setItem("sb.copilot.open", v ? "0" : "1");
      return !v;
    });
  }
  const expanded = hydrated && open;
  if (!expanded) {
    return (
      <div className="hidden w-11 shrink-0 flex-col items-center border-r border-zinc-200/70 bg-white pt-3 md:flex">
        <button
          type="button"
          aria-label="Open copilot"
          title="Copilot"
          onClick={toggle}
          className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
        >
          <Sparkles className="size-[18px]" strokeWidth={2} />
        </button>
      </div>
    );
  }
  return (
    <div className="hidden w-80 shrink-0 flex-col border-r border-zinc-200/70 bg-white md:flex">
      <div className="flex h-14 items-center justify-between border-b border-zinc-200/70 px-4">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-zinc-900">
          <Sparkles className="size-4 text-zinc-400" /> Copilot
        </div>
        <button
          type="button"
          aria-label="Collapse copilot"
          onClick={toggle}
          className="flex size-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
        >
          <PanelRightClose className="size-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-zinc-50 text-zinc-300">
          <Sparkles className="size-5" />
        </span>
        <p className="text-[13px] font-medium text-zinc-600">Your event copilot</p>
        <p className="text-xs leading-relaxed text-zinc-400">
          Score submissions, schedule sessions, and nudge speakers from chat.
          Coming online this week.
        </p>
      </div>
    </div>
  );
}

// Avatar + dropdown (email, View site, Sign out). In the sidebar it renders as
// a full-width account card whose menu opens upward; in the mobile top bar
// it's a compact avatar with a downward menu.
function UserMenu({
  email,
  direction,
  collapsed = false,
}: {
  email: string;
  direction: "up" | "down";
  collapsed?: boolean;
}) {
  const { signOut } = useAuth();
  const initial = (email.trim()[0] || "?").toUpperCase();
  async function onSignOut() {
    await signOut();
    window.location.assign("/");
  }
  const up = direction === "up";
  return (
    <details className="group relative">
      <summary
        className={
          "cursor-pointer select-none list-none marker:hidden [&::-webkit-details-marker]:hidden " +
          (up
            ? "flex h-10 w-full items-center rounded-xl transition-[background-color,box-shadow,scale] duration-150 ease-out hover:bg-white hover:shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.96] " +
              (collapsed ? "justify-center px-0" : "gap-2.5 px-2")
            : "flex size-9 items-center justify-center")
        }
        title={collapsed ? email || "Account" : undefined}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">
          {initial}
        </span>
        {up && !collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-700">
              {email || "Signed in"}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-zinc-400" strokeWidth={2} />
          </>
        ) : null}
      </summary>
      <div
        className={
          "absolute z-40 w-56 overflow-hidden rounded-xl bg-white p-1 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_16px_48px_-16px_rgba(0,0,0,0.25)] " +
          (up ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2")
        }
      >
        <div className="border-b border-zinc-100 px-2.5 py-2">
          <div className="truncate text-[13px] font-medium text-zinc-900">
            {email || "Signed in"}
          </div>
        </div>
        <a
          href="/"
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <ExternalLink className="size-4 text-zinc-400" strokeWidth={2} />
          View site
        </a>
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <LogOut className="size-4 text-zinc-400" strokeWidth={2} />
          Sign out
        </button>
      </div>
    </details>
  );
}
