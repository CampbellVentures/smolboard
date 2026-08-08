"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db } from "@pylonsync/react";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardToolbar,
  DashboardWidePage,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DAY_START_MIN,
  SLOT_MINUTES,
  conflictSessionIds,
  dayKey,
  eventDays,
  findConflicts,
  fmtTime,
  isoAt,
  minutesInDay,
  slotCount,
  type AgendaSession,
} from "@/lib/agenda";
import { parseJson } from "@/lib/types";
import type {
  EventRow,
  RoomRow,
  SessionRow,
  SpeakerProfileRow,
  SubmissionRow,
  TrackRow,
} from "@/lib/types";
import {
  AlertTriangle,
  CalendarX2,
  Coffee,
  GripVertical,
  Plus,
  Trash2,
  X,
} from "lucide-react";

// The agenda builder. One day at a time: columns = rooms, rows = 15-min slots.
// Native HTML5 drag-and-drop:
//   - drag an accepted talk from the tray onto a (room, slot) cell → creates a
//     scheduled Session (default 30 min, speaker attached)
//   - drag a scheduled block to another cell → moves it (duration kept)
//   - click a block → popover to retitle, change duration/track, unschedule,
//     or delete
// Conflicts (same room overlap, speaker double-booked) re-compute on every
// change — pure lib/agenda.ts — and paint the offending blocks red.

const DEFAULT_DURATION_MIN = 30;
const TRACK_COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2"];

interface DragPayload {
  kind: "tray" | "session";
  submissionId?: string;
  sessionId?: string;
}

function toAgenda(s: SessionRow): AgendaSession {
  return {
    id: s.id,
    title: s.title,
    roomId: s.roomId,
    trackId: s.trackId,
    startTime: s.startTime,
    endTime: s.endTime,
    speakerUserIds: parseJson<string[]>(s.speakerUserIdsJson) ?? [],
  };
}

export function AgendaBuilder({
  event,
  initialSessions,
  initialRooms,
  initialTracks,
  submissions,
  profiles,
}: {
  event: EventRow;
  initialSessions: SessionRow[];
  initialRooms: RoomRow[];
  initialTracks: TrackRow[];
  submissions: SubmissionRow[];
  profiles: SpeakerProfileRow[];
}) {
  const tz = event.timezone || "UTC";
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const sesQ = db.useQuery<SessionRow>("Session");
  const roomQ = db.useQuery<RoomRow>("Room");
  const trackQ = db.useQuery<TrackRow>("Track");
  const live = <T extends { eventId: string }>(
    q: { data: T[]; loading: boolean },
    initial: T[],
  ) => (!hydrated || q.loading ? initial : q.data.filter((r) => r.eventId === event.id));
  const sessions = live(sesQ, initialSessions);
  const rooms = live(roomQ, initialRooms).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const tracks = live(trackQ, initialTracks).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const days = useMemo(
    () => eventDays(event.startDate, event.endDate, sessions.map(toAgenda), tz),
    [event.startDate, event.endDate, sessions, tz],
  );
  const [day, setDay] = useState<string>(days[0] ?? "");
  useEffect(() => {
    if (days.length > 0 && !days.includes(day)) setDay(days[0]);
  }, [days, day]);

  const [view, setView] = useState<"grid" | "list" | "tracks">("grid");
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const conflicts = useMemo(() => findConflicts(sessions.map(toAgenda)), [sessions]);
  const conflicted = useMemo(() => conflictSessionIds(conflicts), [conflicts]);

  // Tray: accepted submissions with no session yet + explicitly unscheduled
  // sessions.
  const sessionBySubmission = new Set(sessions.map((s) => s.submissionId).filter(Boolean));
  const trayTalks = submissions.filter(
    (s) => s.status === "accepted" && !sessionBySubmission.has(s.id),
  );
  const traySessions = sessions.filter((s) => !s.startTime || !s.roomId);

  const speakerName = (userId?: string) =>
    profiles.find((p) => p.userId === userId)?.name ?? "";

  /* ---------------- mutations ---------------- */

  async function scheduleAt(payload: DragPayload, roomId: string, minutes: number) {
    const start = isoAt(day, minutes, tz);
    if (payload.kind === "tray" && payload.submissionId) {
      const sub = submissions.find((s) => s.id === payload.submissionId);
      if (!sub) return;
      const end = isoAt(day, minutes + DEFAULT_DURATION_MIN, tz);
      await db.insert("Session", {
        orgId: event.orgId,
        eventId: event.id,
        submissionId: sub.id,
        title: sub.title,
        roomId,
        trackId: undefined,
        startTime: start,
        endTime: end,
        speakerUserIdsJson: JSON.stringify([sub.speakerUserId]),
        kind: "talk",
      });
    } else if (payload.sessionId) {
      const ses = sessions.find((s) => s.id === payload.sessionId);
      if (!ses) return;
      const dur =
        ses.startTime && ses.endTime
          ? (Date.parse(ses.endTime) - Date.parse(ses.startTime)) / 60000
          : DEFAULT_DURATION_MIN;
      await db.update("Session", ses.id, {
        roomId,
        startTime: start,
        endTime: isoAt(day, minutes + dur, tz),
      });
    }
  }

  async function addBreak() {
    await db.insert("Session", {
      orgId: event.orgId,
      eventId: event.id,
      title: "Break",
      kind: "break",
      speakerUserIdsJson: JSON.stringify([]),
    });
  }

  /* ---------------- render ---------------- */

  if (days.length === 0) {
    return (
      <DashboardPage>
        <DashboardEmptyState
          icon={CalendarX2}
          title="Set your event dates first"
          description="The agenda grid uses the event’s start and end dates. Add them in Event settings."
        />
      </DashboardPage>
    );
  }

  const openSession = openSessionId ? sessions.find((s) => s.id === openSessionId) : undefined;

  return (
    <DashboardWidePage>
      {/* Toolbar: day tabs + views + rooms/tracks managers */}
      <DashboardToolbar>
        <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-zinc-200 p-0.5">
          {days.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={day === d ? "default" : "ghost"}
              onClick={() => setDay(d)}
            >
              {formatDayTab(d)}
            </Button>
          ))}
        </div>
        <div className="flex rounded-lg border border-zinc-200 p-0.5">
          {(["grid", "list", "tracks"] as const).map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={view === v ? "secondary" : "ghost"}
              onClick={() => setView(v)}
              className="capitalize"
            >
              {v}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addBreak}
        >
          <Coffee data-icon="inline-start" /> Add break
        </Button>
        </div>
        <div>
          <RoomsManager event={event} rooms={rooms} sessions={sessions} />
        </div>
      </DashboardToolbar>

      {/* Conflict banner */}
      {conflicts.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
          <div className="text-[13px] text-red-700">
            <span className="font-semibold">
              {conflicts.length} scheduling conflict{conflicts.length === 1 ? "" : "s"}:
            </span>{" "}
            {conflicts.slice(0, 3).map((c, i) => {
              const a = sessions.find((s) => s.id === c.a);
              const b = sessions.find((s) => s.id === c.b);
              return (
                <span key={i}>
                  {i > 0 && "; "}
                  “{a?.title}” and “{b?.title}”{" "}
                  {c.kind === "room_overlap"
                    ? `overlap in ${rooms.find((r) => r.id === c.subject)?.name ?? "a room"}`
                    : `double-book ${speakerName(c.subject) || "a speaker"}`}
                </span>
              );
            })}
            {conflicts.length > 3 && ` …and ${conflicts.length - 3} more`}
          </div>
        </div>
      )}

      <div className="flex gap-5">
        {/* Tray */}
        <div className="w-60 shrink-0 space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Unscheduled
          </h3>
          {trayTalks.length === 0 && traySessions.length === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400">
              Accepted talks land here, ready to drag onto the grid.
            </p>
          )}
          {trayTalks.map((sub) => (
            <div
              key={sub.id}
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  "application/json",
                  JSON.stringify({ kind: "tray", submissionId: sub.id } satisfies DragPayload),
                )
              }
              className="cursor-grab rounded-lg border border-zinc-200 bg-white p-2.5 shadow-sm active:cursor-grabbing"
            >
              <div className="flex items-start gap-1.5">
                <GripVertical className="mt-0.5 size-3.5 shrink-0 text-zinc-300" />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-zinc-800">{sub.title}</div>
                  <div className="truncate text-[11px] text-zinc-400">
                    {speakerName(sub.speakerUserId)}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {traySessions.map((ses) => (
            <div
              key={ses.id}
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  "application/json",
                  JSON.stringify({ kind: "session", sessionId: ses.id } satisfies DragPayload),
                )
              }
              onClick={() => setOpenSessionId(ses.id)}
              className="cursor-grab rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2.5 active:cursor-grabbing"
            >
              <div className="flex items-start gap-1.5">
                <GripVertical className="mt-0.5 size-3.5 shrink-0 text-zinc-300" />
                <div className="truncate text-[13px] font-medium text-zinc-600">{ses.title}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Main view */}
        <div className="min-w-0 flex-1">
          {view === "grid" &&
            (rooms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
                <p className="text-sm font-medium text-zinc-700">Add a room to start scheduling</p>
                <p className="mt-1 text-sm text-zinc-400">
                  Rooms become the grid&apos;s columns — use “+ room” in the toolbar.
                </p>
              </div>
            ) : (
              <Grid
                day={day}
                tz={tz}
                rooms={rooms}
                tracks={tracks}
                sessions={sessions}
                conflicted={conflicted}
                onDrop={scheduleAt}
                onOpen={setOpenSessionId}
              />
            ))}
          {view === "list" && (
            <ListView
              tz={tz}
              sessions={sessions.filter((s) => s.startTime && dayKey(s.startTime, tz) === day)}
              rooms={rooms}
              tracks={tracks}
              conflicted={conflicted}
              onOpen={setOpenSessionId}
            />
          )}
          {view === "tracks" && (
            <TracksView
              tz={tz}
              day={day}
              sessions={sessions}
              tracks={tracks}
              event={event}
              conflicted={conflicted}
              onOpen={setOpenSessionId}
            />
          )}
        </div>
      </div>

      {openSession && (
        <SessionPopover
          session={openSession}
          tracks={tracks}
          tz={tz}
          onClose={() => setOpenSessionId(null)}
        />
      )}
    </DashboardWidePage>
  );
}

function formatDayTab(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${names[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/* ============================== Grid ============================== */

const SLOT_PX = 14;

function Grid({
  day,
  tz,
  rooms,
  tracks,
  sessions,
  conflicted,
  onDrop,
  onOpen,
}: {
  day: string;
  tz: string;
  rooms: RoomRow[];
  tracks: TrackRow[];
  sessions: SessionRow[];
  conflicted: Set<string>;
  onDrop: (payload: DragPayload, roomId: string, minutes: number) => void;
  onOpen: (id: string) => void;
}) {
  const [hover, setHover] = useState<{ roomId: string; slot: number } | null>(null);
  const slots = slotCount();
  const daySessions = sessions.filter(
    (s) => s.startTime && s.endTime && s.roomId && dayKey(s.startTime, tz) === day,
  );

  function slotFromEvent(e: React.DragEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return Math.max(0, Math.min(slots - 1, Math.floor(y / SLOT_PX)));
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <div className="flex min-w-fit">
        {/* Time gutter */}
        <div className="w-14 shrink-0 border-r border-zinc-100">
          <div className="h-9 border-b border-zinc-100" />
          <div className="relative" style={{ height: slots * SLOT_PX }}>
            {Array.from({ length: slots / 4 + 1 }, (_, i) => (
              <span
                key={i}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-zinc-400"
                style={{ top: i * 4 * SLOT_PX }}
              >
                {fmtTime(DAY_START_MIN + i * 60)}
              </span>
            ))}
          </div>
        </div>
        {rooms.map((room) => {
          const roomSessions = daySessions.filter((s) => s.roomId === room.id);
          return (
            <div key={room.id} className="min-w-44 flex-1 border-r border-zinc-100 last:border-r-0">
              <div className="flex h-9 items-center justify-center border-b border-zinc-100 px-2 text-[12.5px] font-semibold text-zinc-700">
                {room.name}
              </div>
              <div
                className="relative"
                style={{ height: slots * SLOT_PX }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHover({ roomId: room.id, slot: slotFromEvent(e) });
                }}
                onDragLeave={() => setHover(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setHover(null);
                  try {
                    const payload = JSON.parse(
                      e.dataTransfer.getData("application/json"),
                    ) as DragPayload;
                    onDrop(payload, room.id, DAY_START_MIN + slotFromEvent(e) * SLOT_MINUTES);
                  } catch {
                    // Foreign drag (text, file) — ignore.
                  }
                }}
              >
                {/* hour lines */}
                {Array.from({ length: slots / 4 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 border-t border-zinc-50"
                    style={{ top: i * 4 * SLOT_PX }}
                  />
                ))}
                {/* drop preview */}
                {hover?.roomId === room.id && (
                  <div
                    className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed border-zinc-400/70"
                    style={{ top: hover.slot * SLOT_PX, height: (DEFAULT_DURATION_MIN / SLOT_MINUTES) * SLOT_PX }}
                  />
                )}
                {roomSessions.map((ses) => {
                  const startMin = minutesInDay(ses.startTime!, tz);
                  const endMin = minutesInDay(ses.endTime!, tz);
                  const top = ((startMin - DAY_START_MIN) / SLOT_MINUTES) * SLOT_PX;
                  const height = Math.max(
                    SLOT_PX,
                    ((endMin - startMin) / SLOT_MINUTES) * SLOT_PX,
                  );
                  const track = tracks.find((t) => t.id === ses.trackId);
                  const isBad = conflicted.has(ses.id);
                  return (
                    <div
                      key={ses.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ kind: "session", sessionId: ses.id } satisfies DragPayload),
                        )
                      }
                      onClick={() => onOpen(ses.id)}
                      className={
                        "absolute inset-x-1 cursor-grab overflow-hidden rounded-md border px-2 py-1 text-left shadow-sm transition-shadow hover:shadow active:cursor-grabbing " +
                        (isBad
                          ? "border-red-400 bg-red-50 ring-1 ring-red-400"
                          : ses.kind === "break"
                            ? "border-zinc-200 bg-zinc-50"
                            : "border-zinc-200 bg-white")
                      }
                      style={{
                        top,
                        height,
                        borderLeftWidth: 3,
                        borderLeftColor: isBad
                          ? "#f87171"
                          : track?.color || (ses.kind === "break" ? "#a1a1aa" : "#18181b"),
                      }}
                      title={ses.title}
                    >
                      <div className="truncate text-[11.5px] font-semibold leading-tight text-zinc-800">
                        {ses.title}
                      </div>
                      {height >= 3 * SLOT_PX && (
                        <div className="truncate text-[10.5px] text-zinc-400">
                          {fmtTime(startMin)}–{fmtTime(endMin)}
                          {track ? ` · ${track.name}` : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== List ============================== */

function ListView({
  tz,
  sessions,
  rooms,
  tracks,
  conflicted,
  onOpen,
}: {
  tz: string;
  sessions: SessionRow[];
  rooms: RoomRow[];
  tracks: TrackRow[];
  conflicted: Set<string>;
  onOpen: (id: string) => void;
}) {
  const sorted = sessions.slice().sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Session</TableHead>
            <TableHead>Room</TableHead>
            <TableHead>Track</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((s) => (
            <TableRow
              key={s.id}
              onClick={() => onOpen(s.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(s.id);
                }
              }}
              tabIndex={0}
              className="cursor-pointer transition-colors hover:bg-zinc-50"
            >
              <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {fmtTime(minutesInDay(s.startTime!, tz))}–{fmtTime(minutesInDay(s.endTime!, tz))}
              </TableCell>
              <TableCell>
                <span className="font-medium text-zinc-900">{s.title}</span>
                {conflicted.has(s.id) && (
                  <span className="ml-2 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                    conflict
                  </span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {rooms.find((r) => r.id === s.roomId)?.name ?? "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {tracks.find((t) => t.id === s.trackId)?.name ?? "—"}
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                Nothing scheduled for this day yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/* ============================= Tracks ============================= */

function TracksView({
  tz,
  day,
  sessions,
  tracks,
  event,
  conflicted,
  onOpen,
}: {
  tz: string;
  day: string;
  sessions: SessionRow[];
  tracks: TrackRow[];
  event: EventRow;
  conflicted: Set<string>;
  onOpen: (id: string) => void;
}) {
  const daySessions = sessions.filter((s) => s.startTime && dayKey(s.startTime, tz) === day);
  const lanes: { track: TrackRow | null; list: SessionRow[] }[] = [
    ...tracks.map((t) => ({ track: t as TrackRow | null, list: daySessions.filter((s) => s.trackId === t.id) })),
    { track: null, list: daySessions.filter((s) => !s.trackId) },
  ];
  return (
    <div className="space-y-4">
      <TracksManager event={event} tracks={tracks} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lanes.map(({ track, list }) => (
          <div key={track?.id ?? "none"} className="rounded-xl border border-zinc-200 bg-white">
            <div
              className="border-b border-zinc-100 px-4 py-2.5 text-[13px] font-semibold text-zinc-800"
              style={{ borderTop: `3px solid ${track?.color ?? "#d4d4d8"}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
            >
              {track?.name ?? "No track"}
              <span className="ml-2 text-xs font-normal text-zinc-400">{list.length}</span>
            </div>
            <ul className="divide-y divide-zinc-50">
              {list
                .slice()
                .sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1))
                .map((s) => (
                  <li
                    key={s.id}
                    onClick={() => onOpen(s.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(s.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer px-4 py-2.5 transition-colors hover:bg-zinc-50"
                  >
                    <div className="text-[13px] font-medium text-zinc-900">
                      {s.title}
                      {conflicted.has(s.id) && (
                        <span className="ml-2 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                          conflict
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {fmtTime(minutesInDay(s.startTime!, tz))}–{fmtTime(minutesInDay(s.endTime!, tz))}
                    </div>
                  </li>
                ))}
              {list.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-zinc-300">Empty</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== Rooms + tracks managers ==================== */

function RoomsManager({
  event,
  rooms,
  sessions,
}: {
  event: EventRow;
  rooms: RoomRow[];
  sessions: SessionRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await db.insert("Room", {
      orgId: event.orgId,
      eventId: event.id,
      name: name.trim(),
      sortOrder: rooms.length,
    });
    setName("");
    setAdding(false);
  }
  return (
    <div className="flex items-center gap-1.5">
      {rooms.map((r) => (
        <span
          key={r.id}
          className="group flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] font-medium text-zinc-600"
        >
          {r.name}
          <button
            type="button"
            aria-label={`Remove ${r.name}`}
            onClick={() => {
              if (confirm(`Remove room "${r.name}"? Its sessions move to Unscheduled.`)) {
                void removeRoom(r.id, sessions);
              }
            }}
            className="hidden text-zinc-400 hover:text-red-600 group-hover:block"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <form onSubmit={add} className="flex items-center gap-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !name.trim() && setAdding(false)}
            placeholder="Room name…"
            className="w-32"
            aria-label="New room name"
            autoComplete="off"
          />
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAdding(true)}
        >
          <Plus data-icon="inline-start" /> Room
        </Button>
      )}
    </div>
  );
}

async function removeRoom(roomId: string, sessions: SessionRow[]) {
  // Sessions in this room become unscheduled rather than deleted.
  for (const s of sessions.filter((x) => x.roomId === roomId)) {
    await db.update("Session", s.id, { roomId: undefined, startTime: undefined, endTime: undefined });
  }
  await db.delete("Room", roomId);
}

function TracksManager({ event, tracks }: { event: EventRow; tracks: TrackRow[] }) {
  const [name, setName] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await db.insert("Track", {
      orgId: event.orgId,
      eventId: event.id,
      name: name.trim(),
      color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
      sortOrder: tracks.length,
    });
    setName("");
  }
  return (
    <form onSubmit={add} className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New track name…"
        className="w-44"
        aria-label="New track name"
        autoComplete="off"
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={!name.trim()}
      >
        <Plus data-icon="inline-start" /> Add track
      </Button>
    </form>
  );
}

/* ======================== Session popover ======================== */

const DURATIONS = [15, 25, 30, 45, 60, 90, 120, 180];

function SessionPopover({
  session,
  tracks,
  tz,
  onClose,
}: {
  session: SessionRow;
  tracks: TrackRow[];
  tz: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(session.title);
  const duration =
    session.startTime && session.endTime
      ? Math.round((Date.parse(session.endTime) - Date.parse(session.startTime)) / 60000)
      : DEFAULT_DURATION_MIN;

  async function patch(p: Partial<Record<string, unknown>>) {
    await db.update("Session", session.id, p);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== session.title && patch({ title: title.trim() })}
            className="font-medium"
            aria-label="Session title"
          />
          <Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>

        {session.startTime && (
          <p className="mt-2 text-xs text-zinc-400">
            {fmtTime(minutesInDay(session.startTime, tz))}
            {session.endTime ? `–${fmtTime(minutesInDay(session.endTime, tz))}` : ""}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-duration">Duration</Label>
            <Select
              id="session-duration"
              value={duration}
              disabled={!session.startTime}
              onChange={(e) =>
                session.startTime &&
                patch({
                  endTime: new Date(
                    Date.parse(session.startTime) + Number(e.target.value) * 60000,
                  ).toISOString(),
                })
              }
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
              {!DURATIONS.includes(duration) && <option value={duration}>{duration} min</option>}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-track">Track</Label>
            <Select
              id="session-track"
              value={session.trackId ?? ""}
              onChange={(e) => patch({ trackId: e.target.value || undefined })}
            >
              <option value="">None</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              void patch({ roomId: undefined, startTime: undefined, endTime: undefined });
              onClose();
            }}
          >
            Unschedule
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => {
              if (confirm(`Delete session "${session.title}"?`)) {
                void db.delete("Session", session.id);
                onClose();
              }
            }}
          >
            <Trash2 data-icon="inline-start" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
