"use client";

import React, { useEffect, useState } from "react";
import { callFn, db, Link, type RoomPeer, usePathname, useRoom, useRouter } from "@pylonsync/react";
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
  FileStack,
  BookUser,
  BookOpen,
  Mail,
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
  Bot,
  PanelRightClose,
  ChevronsUpDown,
  Menu,
  MessageSquareText,
  Send,
  Palette,
  Code2,
  UserRound,
  ArrowLeft,
  ChevronRight,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/components/person-avatar";
import { PersonAvatar } from "./person-avatar";
import { SessionReconcile } from "./session-reconcile";
import { SyncHeartbeat } from "./sync-heartbeat";
import { SyncDebug } from "./sync-debug";
import { ActivityBell } from "./activity-bell";
import { CommandPalette, type PaletteDestination } from "./command-palette";
import { lastEventStorageKey } from "@/lib/dashboard-routing";
import { CopilotChat, useCopilotThreads } from "@/components/copilot-chat";
import { useEnsureOrgSlug } from "@/components/use-org-slug";
import { Analytics } from "@/components/analytics";

// Three-pane organizer shell (SPEC.md → "Organizer UI shell"):
//   [nav sidebar] [copilot pane] [content]
// Nav is grouped: primary product items first, admin items under an eyebrow
// label, and the account card pinned to the sidebar's base (menu opens
// upward). The copilot preview opens from the top bar until M3.5 connects it.

export type WorkspaceNavKey = "events" | "speakers" | "members" | "settings" | "reviews";
export type EventNavKey =
  | "overview"
  | "forms"
  | "abstracts"
  | "agenda"
  | "speakers"
  | "tasks"
  | "content"
  | "emails"
  | "resources"
  | "branding"
  | "embeds"
  | "event-settings";

interface PresencePerson {
  id: string;
  name: string;
}

// One neutral treatment for every initials chip — never color-on-color.
const PRESENCE_TONES = ["bg-zinc-100 text-zinc-600"] as const;

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
      className="flex h-10 items-center"
      aria-label={`${status} in ${scopeName}`}
      title={title}
      data-presence-room={roomId}
      data-presence-count={isConnected ? people.length : 0}
    >
      <div className="flex -space-x-2" aria-hidden="true">
        {visiblePeople.map((person, index) => (
          <span
            key={person.id}
            className={`relative flex size-8 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-background ${presenceTone(person.id)}`}
            style={{ zIndex: visiblePeople.length - index }}
          >
            {initialsOf(person.name)}
            {index === 0 ? (
              <span
                className={`absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-background ${
                  error ? "bg-amber-400" : isConnected ? "bg-emerald-500" : "bg-zinc-300"
                }`}
              />
            ) : null}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="relative z-0 flex size-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground ring-2 ring-background">
            +{hiddenCount}
          </span>
        ) : null}
      </div>
      <span className="sr-only">{status}</span>
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
    href: "/dashboard/events",
    Icon: CalendarDays,
    group: "Events",
  },
  { key: "speakers", label: "Speakers", href: "/dashboard/speakers", Icon: BookUser, group: "Events" },
  { key: "members", label: "Team", href: "/dashboard/members", Icon: Users, group: "Workspace" },
  { key: "settings", label: "Settings", href: "/dashboard/settings", Icon: SettingsIcon, group: "Workspace" },
];

const REVIEWER_NAV: NavEntry<WorkspaceNavKey>[] = [
  { key: "reviews", label: "Review queue", href: "/dashboard/reviews", Icon: Inbox, group: "Reviews" },
];

function eventNav(eventId: string): NavEntry<EventNavKey>[] {
  const base = `/dashboard/events/${eventId}`;
  return [
    { key: "overview", label: "Overview", href: `${base}/overview`, Icon: LayoutDashboard },
    { key: "forms", label: "Forms", href: `${base}/forms`, Icon: FileText, group: "Collect" },
    { key: "abstracts", label: "Submissions", href: `${base}/abstracts`, Icon: Inbox, group: "Manage" },
    { key: "agenda", label: "Agenda", href: `${base}/agenda`, Icon: CalendarClock, group: "Manage" },
    { key: "speakers", label: "Speakers", href: `${base}/speakers`, Icon: Mic2, group: "Speakers" },
    { key: "tasks", label: "Tasks", href: `${base}/tasks`, Icon: ListChecks, group: "Speakers" },
    { key: "content", label: "Content", href: `${base}/content`, Icon: FileStack, group: "Speakers" },
    { key: "emails", label: "Emails", href: `${base}/emails`, Icon: Mail, group: "Speakers" },
    { key: "resources", label: "Resources", href: `${base}/resources`, Icon: BookOpen, group: "Speakers" },
    { key: "branding", label: "Branding", href: `${base}/branding`, Icon: Palette, group: "Publish" },
    { key: "embeds", label: "Embeds", href: `${base}/embeds`, Icon: Code2, group: "Publish" },
    { key: "event-settings", label: "Settings", href: `${base}/settings`, Icon: SettingsIcon, group: "Event" },
  ];
}

// Event switcher: the same shape as the workspace switcher directly above it,
// so the sidebar reads workspace → event → sections. Sibling events come from
// a live query, and picking one lands on the equivalent section.
// Inside an event, the sidebar's job is to get you back out of it. The event's
// own name lives in the page header instead, so this row doesn't repeat it.
// gap-2.5 matches GroupedNav so the label lands on the same vertical line as
// every nav item below it.
function BackToEvents({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard/events"
      onClick={onNavigate}
      className="group flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out hover:bg-background hover:text-foreground active:scale-[0.98] motion-reduce:transform-none"
    >
      <ArrowLeft
        className="size-4 shrink-0 transition-[translate] duration-150 ease-out group-hover:-translate-x-0.5 motion-reduce:transform-none"
        aria-hidden="true"
      />
      Back to events
    </Link>
  );
}

// Navigation stays intentionally quiet; primary-colored surfaces are reserved
// for actions, while location is conveyed by a soft selected row.
function NavItem<K extends string>({
  item,
  isActive,
  onNavigate,
}: {
  item: NavEntry<K>;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] motion-reduce:transform-none",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <item.Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0 transition-colors duration-150",
          isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
        strokeWidth={2}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function GroupedNav<K extends string>({
  items,
  active,
  pinnedGroup,
  onNavigate,
}: {
  items: NavEntry<K>[];
  active: string;
  pinnedGroup?: string;
  onNavigate?: () => void;
}) {
  const ungrouped = items.filter((n) => !n.group);
  const groups = [...new Set(items.map((n) => n.group).filter(Boolean))] as string[];
  return (
    <nav className="flex flex-1 flex-col overflow-y-auto px-3 pt-2">
      <div className="flex flex-col gap-1">
        {ungrouped.map((n) => (
          <NavItem
            key={n.key}
            item={n}
            isActive={active === n.key}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      {groups.map((g) => (
        <div
          key={g}
          className={cn(
            g === pinnedGroup
              ? "mt-auto border-t border-border/70 pb-3 pt-3"
              : "mt-4",
          )}
        >
          <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {g}
          </div>
          <div className="flex flex-col gap-1">
            {items
              .filter((n) => n.group === g)
              .map((n) => (
                <NavItem
                  key={n.key}
                  item={n}
                  isActive={active === n.key}
                  onNavigate={onNavigate}
                />
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function CopilotShortcut({
  eventId,
  activeThreadId,
  onOpen,
  onDelete,
}: {
  eventId: string;
  activeThreadId: string | null;
  onOpen: (threadId: string | null) => void;
  onDelete: (threadId: string) => void;
}) {
  const threads = useCopilotThreads(eventId);
  return (
    <div className="px-3 pb-3">
      <div className="mb-1 flex items-center justify-between gap-2 pl-3 pr-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Copilot
        </span>
        <button
          type="button"
          onClick={() => onOpen(null)}
          aria-label="New conversation"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out hover:bg-accent/60 hover:text-foreground active:scale-[0.96] motion-reduce:transform-none"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {threads.length === 0 ? (
        <button
          type="button"
          onClick={() => onOpen(null)}
          className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out hover:bg-accent/60 hover:text-foreground active:scale-[0.96] motion-reduce:transform-none"
        >
          <MessageSquareText className="size-[17px] shrink-0" aria-hidden="true" />
          <span>New conversation</span>
        </button>
      ) : (
        <ul className="flex flex-col">
          {threads.slice(0, 6).map((thread) => (
            <li key={thread.id} className="group/thread relative">
              <button
                type="button"
                onClick={() => onOpen(thread.id)}
                title={thread.title}
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-lg py-0 pl-3 pr-9 text-left text-[13px] transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.98] motion-reduce:transform-none",
                  thread.id === activeThreadId
                    ? "bg-accent/70 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <MessageSquareText className="size-[17px] shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{thread.title}</span>
              </button>
              {/* Shown on hover and whenever focused, so it is reachable by
                  keyboard rather than hover-only. */}
              <button
                type="button"
                aria-label={`Delete conversation: ${thread.title}`}
                onClick={() => onDelete(thread.id)}
                className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover/thread:opacity-100"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  reviewerMode = false,
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
  reviewerMode?: boolean;
  // Right-aligned header controls (e.g. "+ New form").
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const presenceRoomId = event
    ? `smolboard:event:${event.id}`
    : `smolboard:workspace:${workspaceId}`;
  const presenceScopeName = event?.name ?? orgName ?? "this workspace";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  useEffect(() => {
    setCopilotOpen(localStorage.getItem("sb.copilot.open") === "1");
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  useEffect(() => {
    if (event) {
      localStorage.setItem(lastEventStorageKey(workspaceId), event.id);
    }
  }, [event, workspaceId]);
  // Every workspace that opens the dashboard gets a public URL handle, so
  // /<org-slug>/<event-slug> pages and dashboard preview links always resolve.
  useEnsureOrgSlug(Boolean(workspaceId));

  function setCopilot(next: boolean) {
    setCopilotOpen(next);
    localStorage.setItem("sb.copilot.open", next ? "1" : "0");
  }

  // The active conversation is owned here because two places drive it: the
  // sidebar's conversation list and the pane's own "New" button.
  const [copilotThreadId, setCopilotThreadId] = useState<string | null>(null);
  const threadStorageKey = event ? `sb.copilot.thread.${event.id}` : null;
  useEffect(() => {
    setCopilotThreadId(threadStorageKey ? localStorage.getItem(threadStorageKey) : null);
  }, [threadStorageKey]);
  function selectCopilotThread(id: string | null) {
    setCopilotThreadId(id);
    if (!threadStorageKey) return;
    if (id) localStorage.setItem(threadStorageKey, id);
    else localStorage.removeItem(threadStorageKey);
  }
  function openCopilotThread(id: string | null) {
    selectCopilotThread(id);
    setCopilot(true);
  }
  async function deleteCopilotThread(id: string) {
    // Drop the selection first so the pane doesn't render a thread that is
    // about to stop existing.
    if (copilotThreadId === id) selectCopilotThread(null);
    try {
      await callFn("deleteCopilotThread", { threadId: id });
    } catch {
      toast.error("Could not delete that conversation.");
    }
  }

  const paletteDestinations: PaletteDestination[] = [
    ...(event ? eventNav(event.id) : []),
    ...WORKSPACE_NAV,
  ].map((entry) => ({ label: entry.label, href: entry.href, group: "Go to", icon: entry.Icon }));
  return (
    // The DOCUMENT scrolls, deliberately. An earlier version made the shell one
    // viewport tall with each pane scrolling internally, which pinned the
    // copilot composer but broke End / PageDown / window.scrollBy — the content
    // pane stopped responding to every normal way of scrolling a page. The side
    // panes are sticky instead: they stay pinned to the viewport with their own
    // internal scroll, and the page scrolls the way a page should.
    <div className="flex min-h-dvh bg-background text-foreground">
      <Analytics />
      <SessionReconcile />
      <SyncHeartbeat />
      <SyncDebug />
      {!reviewerMode ? (
        <CommandPalette
          workspaceId={workspaceId}
          eventId={event?.id}
          destinations={paletteDestinations}
        />
      ) : null}
      {/* ---------- Pane 1: nav sidebar ---------- */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/70 bg-muted/35 md:sticky md:top-0 md:flex md:h-dvh">
        <div className="flex flex-col gap-1.5 px-3 pb-2 pt-3">
            <OrganizationSwitcher
              hidePersonal
              initialActiveName={orgName}
              onSwitched={() => router.push("/dashboard")}
              className="w-full [&>button]:h-12 [&>button]:w-full [&>button]:justify-start [&>button]:rounded-lg [&>button]:border-0 [&>button]:bg-background/70 [&>button]:px-2.5 [&>button]:shadow-none [&>button]:transition-[background-color,scale] [&>button]:duration-150 [&>button]:ease-out [&>button]:hover:bg-background [&>button]:active:scale-[0.96] [&>button>span:first-child]:size-8 [&>button>span:first-child]:rounded-lg [&>button>span:nth-child(2)]:min-w-0 [&>button>span:nth-child(2)]:flex-1 [&>button>span:nth-child(2)]:text-left"
            />
          {event ? <BackToEvents /> : null}
        </div>

        {event ? (
          <>
            <GroupedNav items={eventNav(event.id)} active={active} />
            <CopilotShortcut
              eventId={event.id}
              activeThreadId={copilotOpen ? copilotThreadId : null}
              onOpen={openCopilotThread}
              onDelete={(id) => void deleteCopilotThread(id)}
            />
          </>
        ) : (
          <GroupedNav
            items={reviewerMode ? REVIEWER_NAV : WORKSPACE_NAV}
            active={active}
            pinnedGroup="Workspace"
          />
        )}

        {/* Account card pinned to the sidebar's base; menu opens upward. */}
        <div className="border-t border-border/70 p-3">
          <UserMenu email={userEmail} direction="up" />
        </div>
      </aside>

      {/* ---------- Pane 2: copilot ---------- */}
      <CopilotPane
        open={copilotOpen}
        event={event}
        threadId={copilotThreadId}
        onSelectThread={selectCopilotThread}
        onClose={() => setCopilot(false)}
      />

      {/* ---------- Pane 3: content ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background px-3 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-1.5">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="md:hidden"
                  aria-label="Open navigation"
                >
                  <Menu data-icon="inline-start" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[min(88vw,18rem)] gap-0 overscroll-contain p-0 [&>button]:size-10 [&>button]:rounded-lg"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Dashboard navigation</SheetTitle>
                  <SheetDescription>Navigate the workspace and current event.</SheetDescription>
                </SheetHeader>
                <div className="flex h-full flex-col bg-muted/35">
                  <div className="flex flex-col gap-1.5 px-3 pb-2 pt-3">
                      <OrganizationSwitcher
                        hidePersonal
                        initialActiveName={orgName}
                        onSwitched={() => {
                          setMobileNavOpen(false);
                          router.push("/dashboard");
                        }}
                        className="w-full [&>button]:h-10 [&>button]:w-full [&>button]:justify-start [&>button]:rounded-lg [&>button]:border-0 [&>button]:bg-background/70 [&>button]:px-2.5 [&>button]:shadow-none"
                      />
                    {event ? (
                      <BackToEvents onNavigate={() => setMobileNavOpen(false)} />
                    ) : null}
                  </div>
                  <GroupedNav
                    items={event ? eventNav(event.id) : reviewerMode ? REVIEWER_NAV : WORKSPACE_NAV}
                    active={active}
                    pinnedGroup={event ? undefined : "Workspace"}
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                  {event ? (
                    <CopilotShortcut
                      eventId={event.id}
                      activeThreadId={copilotOpen ? copilotThreadId : null}
                      onOpen={(id) => {
                        setMobileNavOpen(false);
                        openCopilotThread(id);
                      }}
                      onDelete={(id) => void deleteCopilotThread(id)}
                    />
                  ) : null}
                  <div className="border-t border-border/70 p-3">
                    <UserMenu email={userEmail} direction="up" />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            {/* The sidebar no longer names the event, so the header does:
                event, then the section you're in. The event name is the part
                that gives when space runs out. */}
            <h1 className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold tracking-tight">
              {event ? (
                <>
                  <span className="hidden min-w-0 truncate font-normal text-muted-foreground sm:inline">
                    {event.name}
                  </span>
                  <ChevronRight
                    className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:inline"
                    aria-hidden="true"
                  />
                </>
              ) : null}
              <span className="shrink-0 truncate">{title}</span>
            </h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {actions}
            {!reviewerMode ? <Button
              type="button"
              size="sm"
              variant="ghost"
              className="hidden md:inline-flex"
              onClick={() => setCopilot(!copilotOpen)}
              aria-label="Ask smolboard"
              aria-expanded={copilotOpen}
            >
              <Bot data-icon="inline-start" />
              <span className="hidden xl:inline">Ask smolboard</span>
              <span className="xl:hidden">Ask</span>
            </Button> : null}
            {!reviewerMode ? <ActivityBell workspaceId={workspaceId} /> : null}
            {/* Presence is desktop-only. Below md the account avatar sits in
                this same bar, and two round avatars side by side read as one
                control duplicated rather than "them" next to "you". */}
            <div className="hidden md:block">
              <PresenceIndicator
                roomId={presenceRoomId}
                userId={userId}
                userName={userName}
                scopeName={presenceScopeName}
              />
            </div>
            {/* Sidebar (and its account card) is hidden below md; the top bar
                carries the account menu on small screens only. */}
            <div className="md:hidden">
              <UserMenu email={userEmail} direction="down" />
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-auto p-4 md:p-5 xl:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

// Visual shell for M3.5. It already has the final thread/composer geometry so
// the streaming implementation can replace the preview without moving chrome.
function CopilotPane({
  open,
  event,
  threadId,
  onSelectThread,
  onClose,
}: {
  open: boolean;
  event?: { id: string; name: string };
  threadId: string | null;
  onSelectThread: (id: string | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  if (!open) return null;
  const eventName = event?.name;
  const prompts = ["Summarize this workspace", "What needs attention?", "Help me plan an event"];

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-border/60 bg-background shadow-[0_16px_48px_-16px_rgba(0,0,0,0.22)] md:fixed md:inset-y-0 md:right-0 md:z-40 md:flex xl:sticky xl:inset-y-auto xl:top-0 xl:z-auto xl:h-dvh xl:border-l-0 xl:border-r xl:shadow-none">
      <div className="flex h-14 items-center justify-between border-b border-border/60 px-4">
        <div className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold">
          <Bot className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">Copilot</span>
          {!event && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Preview
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {event ? (
            <button
              type="button"
              onClick={() => onSelectThread(null)}
              className="flex h-8 items-center gap-1 rounded-full bg-muted px-2.5 text-[11px] font-medium text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.96] motion-reduce:transform-none"
            >
              <Plus className="size-3" aria-hidden="true" /> New
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Collapse copilot"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.96] motion-reduce:transform-none"
          >
            <PanelRightClose className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {event ? (
        // Inside an event: the real agent (functions/copilotChat.ts over the
        // shared tool belt). Workspace level keeps the teaser below — the
        // copilot's tools are all event-scoped.
        <CopilotChat
          eventId={event.id}
          eventName={event.name}
          threadId={threadId}
          onSelectThread={onSelectThread}
        />
      ) : (
        <WorkspaceCopilotTeaser draft={draft} setDraft={setDraft} prompts={prompts} eventName={eventName} />
      )}
    </aside>
  );
}

function WorkspaceCopilotTeaser({
  draft,
  setDraft,
  prompts,
  eventName,
}: {
  draft: string;
  setDraft: (v: string) => void;
  prompts: string[];
  eventName?: string;
}) {
  return (
    <>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 pt-1">
            <p className="text-pretty text-sm leading-6 text-foreground">
              I can help run {eventName ?? "your workspace"} from here. Ask me to review
              submissions, schedule sessions, or follow up with speakers.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Open an event to put me to work. My tools are event-scoped.
            </p>
          </div>
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-8">
          <div className="px-1 text-[11px] font-medium text-muted-foreground">
            Try asking
          </div>
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setDraft(prompt)}
              className="min-h-10 rounded-xl bg-muted/50 px-3 py-2 text-left text-xs text-foreground transition-[background-color,scale] duration-150 ease-out hover:bg-muted active:scale-[0.98] motion-reduce:transform-none"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-border/60 p-3">
        <div className="rounded-2xl bg-muted/45 p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)] transition-[box-shadow] duration-150 focus-within:shadow-[0_0_0_2px_var(--ring)]">
          <Textarea
            value={draft}
            onChange={(event_) => setDraft(event_.target.value)}
            aria-label="Message copilot"
            placeholder="Ask about your event…"
            className="min-h-14 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="mt-1 flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] text-muted-foreground">smolboard tools</span>
            <Button
              type="button"
              size="icon"
              className="size-8 rounded-full"
              disabled
              aria-label="Send message"
              title="Open an event to chat with the copilot"
            >
              <Send data-icon="inline-start" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// Avatar + dropdown (email, View site, Sign out). In the sidebar it renders as
// a full-width account card whose menu opens upward; in the mobile top bar
// it's a compact avatar with a downward menu.
function UserMenu({
  email,
  direction,
}: {
  email: string;
  direction: "up" | "down";
}) {
  const { signOut, session } = useAuth();
  const initial = (email.trim()[0] || "?").toUpperCase();
  const avatarUrl = (session as { avatarUrl?: string | null } | null)?.avatarUrl ?? null;
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
            ? "flex h-10 w-full items-center gap-2.5 rounded-lg px-2 transition-[background-color,scale] duration-150 ease-out hover:bg-background/80 active:scale-[0.96] motion-reduce:transform-none"
            : "flex size-10 items-center justify-center rounded-lg transition-[background-color] hover:bg-muted")
        }
      >
        {avatarUrl ? (
          <PersonAvatar name={email} src={avatarUrl} size="sm" />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600">
            {initial}
          </span>
        )}
        {up ? (
          <>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
              {email || "Signed in"}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
          </>
        ) : null}
      </summary>
      <div
        className={
          "absolute z-40 w-56 overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_16px_48px_-16px_rgba(0,0,0,0.25)] " +
          (up ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2")
        }
      >
        <div className="border-b border-border/60 px-2.5 py-2">
          <div className="truncate text-[13px] font-medium">
            {email || "Signed in"}
          </div>
        </div>
        <Link
          href="/dashboard/profile"
          className="flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted/70"
        >
          <UserRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
          Your profile
        </Link>
        <a
          href="/"
          className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-foreground transition-[background-color] hover:bg-muted"
        >
          <ExternalLink className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
          View site
        </a>
        <button
          type="button"
          onClick={onSignOut}
          className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground transition-[background-color] hover:bg-muted"
        >
          <LogOut className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </details>
  );
}
