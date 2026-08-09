"use client";

import React, { useEffect, useMemo, useState } from "react";
import { callFn, db } from "@pylonsync/react";
import { AlertTriangle, CheckCircle2, ClipboardList, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  DashboardEmptyState,
  DashboardPage,
  DashboardStatStrip,
  DashboardStatusBadge,
  DashboardToolbar,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { ResponsiveFormOverlay } from "@/components/responsive-overlay";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { fieldsOf } from "@/lib/types";
import { taskDueState } from "@/lib/tasks";
import {
  filterDeliverableTasks,
  latestVersion,
  taskSlot,
  versionsForSlot,
  type DeliverableProgressFilter,
} from "@/lib/deliverables";
import type {
  DeliverableCommentRow,
  DeliverableSlotRow,
  DeliverableVersionRow,
  EventRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionRow,
  SessionRow,
  TaskTemplateRow,
} from "@/lib/types";

interface EditorState {
  id?: string;
  title: string;
  description: string;
  kind: string;
  target: string;
  responsePrompt: string;
  dueAt: string;
  appliesTo: string;
  speakerUserIds: string[];
}

const blankEditor: EditorState = {
  title: "",
  description: "",
  kind: "confirm",
  target: "",
  responsePrompt: "",
  dueAt: "",
  appliesTo: "accepted",
  speakerUserIds: [],
};

export function TasksClient({
  event,
  initialTemplates,
  initialTasks,
  profiles,
  submissions,
  initialDeliverableSlots,
  initialDeliverableVersions,
  initialDeliverableComments,
  sessions,
}: {
  event: EventRow;
  initialTemplates: TaskTemplateRow[];
  initialTasks: SpeakerTaskRow[];
  profiles: SpeakerProfileRow[];
  submissions: SubmissionRow[];
  initialDeliverableSlots: DeliverableSlotRow[];
  initialDeliverableVersions: DeliverableVersionRow[];
  initialDeliverableComments: DeliverableCommentRow[];
  sessions: SessionRow[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const templateQuery = db.useQuery<TaskTemplateRow>("TaskTemplate");
  const taskQuery = db.useQuery<SpeakerTaskRow>("SpeakerTask");
  const slotQuery = db.useQuery<DeliverableSlotRow>("DeliverableSlot");
  const versionQuery = db.useQuery<DeliverableVersionRow>("DeliverableVersion");
  const commentQuery = db.useQuery<DeliverableCommentRow>("DeliverableComment");
  const templates = (!hydrated || templateQuery.loading ? initialTemplates : templateQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const tasks = (!hydrated || taskQuery.loading ? initialTasks : taskQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const deliverableSlots = (!hydrated || slotQuery.loading ? initialDeliverableSlots : slotQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const deliverableVersions = (!hydrated || versionQuery.loading ? initialDeliverableVersions : versionQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const deliverableComments = (!hydrated || commentQuery.loading ? initialDeliverableComments : commentQuery.data).filter(
    (row) => row.eventId === event.id,
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [progressFilter, setProgressFilter] = useState<"all" | "pending" | "done">("all");
  const [deliverableFilter, setDeliverableFilter] = useState<DeliverableProgressFilter>("all");
  const acceptedSpeakers = new Set(
    submissions.filter((row) => row.status === "accepted").map((row) => row.speakerUserId),
  );
  const completed = tasks.filter((task) => task.status === "done").length;
  const now = new Date();
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const overdue = tasks.filter(
    (task) => taskDueState(task, templateById.get(task.taskTemplateId) ?? {}, now) === "overdue",
  );

  const rows = useMemo(
    () =>
      templates
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((template) => {
          const assigned = tasks.filter((task) => task.taskTemplateId === template.id);
          return {
            template,
            assigned: assigned.length,
            completed: assigned.filter((task) => task.status === "done").length,
            overdue: assigned.filter((task) => taskDueState(task, template, now) === "overdue").length,
          };
        }),
    [templates, tasks],
  );

  function editTemplate(template: TaskTemplateRow) {
    setEditor({
      id: template.id,
      title: template.title,
      description: template.description ?? "",
      kind: template.kind,
      target: template.target ?? "",
      responsePrompt: fieldsOf(template)[0]?.label ?? "",
      dueAt: toLocalDateTime(template.dueAt),
      appliesTo: template.appliesTo,
      speakerUserIds: tasks
        .filter((task) => task.taskTemplateId === template.id)
        .map((task) => task.speakerUserId),
    });
  }

  async function save(event_: React.FormEvent) {
    event_.preventDefault();
    if (!editor) return;
    setSaving(true);
    try {
      const result = await callFn<{ id: string; tasksCreated: number }>("saveTaskTemplate", {
        eventId: event.id,
        templateId: editor.id,
        title: editor.title,
        description: editor.description || undefined,
        kind: editor.kind,
        target: editor.target || undefined,
        responsePrompt: editor.responsePrompt || undefined,
        dueAt: editor.dueAt ? new Date(editor.dueAt).toISOString() : undefined,
        appliesTo: editor.appliesTo,
        speakerUserIds: editor.appliesTo === "selected" ? editor.speakerUserIds : undefined,
      });
      setEditor(null);
      toast.success(editor.id ? "Task updated" : "Task created", {
        description: result.tasksCreated ? `Assigned to ${result.tasksCreated} speaker${result.tasksCreated === 1 ? "" : "s"}.` : undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the task.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(templateId: string) {
    try {
      await callFn("deleteTaskTemplate", { templateId });
      toast.success("Task deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the task.");
    }
  }

  async function nudgeOverdue() {
    const speakerUserIds = [...new Set(overdue.map((task) => task.speakerUserId))];
    if (speakerUserIds.length === 0) return;
    try {
      const result = await callFn<{ queued: number }>("nudgeSpeakers", {
        eventId: event.id,
        speakerUserIds,
      });
      toast.success(`Queued ${result.queued} reminder${result.queued === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue reminders.");
    }
  }

  return (
    <DashboardPage>
      {rows.length === 0 ? (
        <DashboardEmptyState
          icon={ClipboardList}
          title="No onboarding tasks yet"
          description="Create the steps every accepted speaker needs to complete before the event."
        >
          <Button type="button" onClick={() => setEditor({ ...blankEditor })}>
            <Plus data-icon="inline-start" /> Create first task
          </Button>
        </DashboardEmptyState>
      ) : (
        <>
          <DashboardStatStrip
            items={[
              { icon: ClipboardList, label: "Templates", value: templates.length },
              { icon: Users, label: "Accepted speakers", value: acceptedSpeakers.size },
              {
                icon: CheckCircle2,
                label: "Completed",
                value: completed,
                hint: `${tasks.length} assigned`,
              },
              { icon: AlertTriangle, label: "Overdue", value: overdue.length },
            ]}
          />

          <DashboardToolbar className="justify-end">
            <div className="flex gap-2">
              {overdue.length > 0 ? (
                <Button type="button" variant="outline" onClick={nudgeOverdue}>
                  Nudge overdue
                </Button>
              ) : null}
              <Button type="button" onClick={() => setEditor({ ...blankEditor })}>
                <Plus data-icon="inline-start" /> New task
              </Button>
            </div>
          </DashboardToolbar>

          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ template, assigned, completed: rowCompleted, overdue: rowOverdue }) => (
                <TableRow
                  key={template.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => editTemplate(template)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      editTemplate(template);
                    }
                  }}
                >
                  <TableCell>
                    <div className="font-medium">{template.title}</div>
                    {template.description ? <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{template.description}</div> : null}
                  </TableCell>
                  <TableCell><DashboardStatusBadge status={template.kind}>{template.kind}</DashboardStatusBadge></TableCell>
                  <TableCell className="text-muted-foreground">{formatDue(template.dueAt)}</TableCell>
                  <TableCell>
                    <span className="tabular-nums">{rowCompleted}/{assigned}</span>
                    {rowOverdue > 0 ? <span className="ml-2 text-xs text-destructive">{rowOverdue} overdue</span> : null}
                  </TableCell>
                  <TableCell
                    onClick={(click) => click.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${template.title}`}>
                          <Trash2 data-icon="inline-start" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{template.title}”?</AlertDialogTitle>
                          <AlertDialogDescription>This also removes the task from every speaker’s checklist.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => remove(template.id)}>Delete task</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
        </>
      )}

      {templates.length > 0 && profiles.length > 0 ? (
        <section className="space-y-3">
          <DashboardToolbar>
            <div>
              <h2 className="text-sm font-semibold">Per-speaker progress</h2>
              <p className="text-xs text-muted-foreground">Every assignment and portal completion at list level.</p>
            </div>
            <Select
              aria-label="Filter task progress"
              value={progressFilter}
              onChange={(event) => setProgressFilter(event.target.value as typeof progressFilter)}
              className="w-40"
            >
              <option value="all">All assignments</option>
              <option value="pending">Incomplete</option>
              <option value="done">Complete</option>
            </Select>
          </DashboardToolbar>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Speaker</TableHead>
                  {templates.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((template) => (
                    <TableHead key={template.id}>{template.title}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .filter((profile) => {
                    if (progressFilter === "all") return true;
                    return tasks.some(
                      (task) => task.speakerUserId === profile.userId && task.status === progressFilter,
                    );
                  })
                  .map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <div className="font-medium">{profile.name}</div>
                        <div className="text-xs text-muted-foreground">{profile.email}</div>
                      </TableCell>
                      {templates.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((template) => {
                        const assignment = tasks.find(
                          (task) => task.speakerUserId === profile.userId && task.taskTemplateId === template.id,
                        );
                        return (
                          <TableCell key={template.id}>
                            {assignment ? (
                              <DashboardStatusBadge status={assignment.status}>
                                {assignment.status === "done" ? "Complete" : "Incomplete"}
                              </DashboardStatusBadge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not assigned</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      <DeliverablesLibrary
        tasks={tasks.filter((task) => templateById.get(task.taskTemplateId)?.kind === "upload")}
        templates={templates}
        profiles={profiles}
        sessions={sessions}
        slots={deliverableSlots}
        versions={deliverableVersions}
        comments={deliverableComments}
        filter={deliverableFilter}
        onFilter={setDeliverableFilter}
        onRemind={async (speakerUserIds) => {
          const result = await callFn<{ queued: number }>("nudgeSpeakers", { eventId: event.id, speakerUserIds });
          toast.success(`Queued ${result.queued} reminder${result.queued === 1 ? "" : "s"}`);
        }}
      />

      <TaskEditor editor={editor} onChange={setEditor} saving={saving} onSubmit={save} profiles={profiles} />
    </DashboardPage>
  );
}

export function DeliverablesLibrary({
  tasks,
  templates,
  profiles,
  sessions,
  slots,
  versions,
  comments,
  filter,
  onFilter,
  onRemind,
}: {
  tasks: SpeakerTaskRow[];
  templates: TaskTemplateRow[];
  profiles: SpeakerProfileRow[];
  sessions: SessionRow[];
  slots: DeliverableSlotRow[];
  versions: DeliverableVersionRow[];
  comments: DeliverableCommentRow[];
  filter: DeliverableProgressFilter;
  onFilter: (filter: DeliverableProgressFilter) => void;
  onRemind: (speakerUserIds: string[]) => Promise<void>;
}) {
  const visible = filterDeliverableTasks(tasks, templates, slots, versions, filter);
  const templateById = new Map(templates.map((template) => [template.id, template]));
  const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const outstanding = [...new Set(visible.filter((task) => !latestVersion(versions, taskSlot(slots, task.id)?.id ?? "")).map((task) => task.speakerUserId))];

  if (tasks.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Deliverables library">
      <DashboardToolbar>
        <div>
          <h2 className="text-sm font-semibold">Deliverables library</h2>
          <p className="text-xs text-muted-foreground">Version metadata and comments across file-request tasks. File bytes remain available only to the uploader.</p>
        </div>
        <div className="flex gap-2">
          <Select
            aria-label="Filter deliverables"
            value={filter}
            onChange={(event) => onFilter(event.target.value as DeliverableProgressFilter)}
            className="w-36"
          >
            <option value="all">All deliverables</option>
            <option value="pending">Incomplete</option>
            <option value="uploaded">Uploaded</option>
            <option value="overdue">Overdue</option>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={outstanding.length === 0}
            onClick={() => void onRemind(outstanding)}
          >
            Remind outstanding ({outstanding.length})
          </Button>
        </div>
      </DashboardToolbar>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Speaker / session</TableHead>
              <TableHead>Task / due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Latest file</TableHead>
              <TableHead>Versions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((task) => {
              const template = templateById.get(task.taskTemplateId);
              const profile = profileByUser.get(task.speakerUserId);
              const slot = taskSlot(slots, task.id);
              const taskVersions = slot ? versionsForSlot(versions, slot.id) : [];
              const latest = taskVersions[0];
              const session = slot?.sessionId ? sessionById.get(slot.sessionId) : undefined;
              const thread = slot ? comments.filter((comment) => comment.slotId === slot.id) : [];
              return (
                <React.Fragment key={task.id}>
                  <TableRow>
                    <TableCell>
                      <div className="font-medium">{profile?.name ?? "Unknown speaker"}</div>
                      <div className="text-xs text-muted-foreground">{session?.title ?? "No single session association"}</div>
                    </TableCell>
                    <TableCell>
                      <div>{template?.title ?? "Unknown task"}</div>
                      <div className="text-xs text-muted-foreground">{formatDue(template?.dueAt)}</div>
                    </TableCell>
                    <TableCell>
                      <DashboardStatusBadge status={latest ? "done" : "pending"}>
                        {latest ? "Uploaded" : "Incomplete"}
                      </DashboardStatusBadge>
                    </TableCell>
                    <TableCell>
                      {latest ? (
                        <div>
                          <div className="font-medium">{latest.filename}</div>
                          <div className="text-xs text-muted-foreground">{new Date(latest.createdAt).toLocaleString()} · {formatBytes(latest.size)}</div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{taskVersions.length}</TableCell>
                  </TableRow>
                  {slot && (taskVersions.length > 0 || thread.length > 0) ? (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/30">
                        <DeliverableThread slot={slot} versions={taskVersions} comments={thread} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              );
            })}
            {visible.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No deliverables match this filter.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function DeliverableThread({
  slot,
  versions,
  comments,
}: {
  slot: DeliverableSlotRow;
  versions: DeliverableVersionRow[];
  comments: DeliverableCommentRow[];
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await callFn("addDeliverableComment", { slotId: slot.id, versionId: versions[0]?.id, body: reply.trim() });
      setReply("");
      toast.success("Comment added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the comment.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="text-xs font-medium">Version history</p>
        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
          {versions.map((version, index) => (
            <li key={version.id}>v{version.versionNumber} · {version.filename} · {new Date(version.createdAt).toLocaleString()}{index === 0 ? " · latest" : ""}</li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">Download unavailable to organizers: Pylon file ownership remains with the uploading speaker.</p>
      </div>
      <div>
        <p className="text-xs font-medium">Comments</p>
        <ul className="mt-1 space-y-1 text-xs">
          {comments.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((comment) => (
            <li key={comment.id}><span className="font-medium">{comment.authorName}</span> <span className="text-muted-foreground">· {new Date(comment.createdAt).toLocaleString()}</span><div>{comment.body}</div></li>
          ))}
        </ul>
        <form onSubmit={submit} className="mt-2 flex gap-2">
          <Input aria-label={`Reply to ${slot.title}`} value={reply} maxLength={2000} onChange={(event) => setReply(event.target.value)} placeholder="Reply…" />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !reply.trim()}>{busy ? "Adding…" : "Reply"}</Button>
        </form>
      </div>
    </div>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function TaskEditor({
  editor,
  onChange,
  saving,
  onSubmit,
  profiles,
}: {
  editor: EditorState | null;
  onChange: (value: EditorState | null) => void;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
  profiles: SpeakerProfileRow[];
}) {
  if (!editor) return null;
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => onChange({ ...editor, [key]: value });
  return (
    <ResponsiveFormOverlay.Root open onOpenChange={(open) => !open && onChange(null)}>
      <ResponsiveFormOverlay.Content>
        <form onSubmit={onSubmit} className="contents">
          <ResponsiveFormOverlay.Header>
            <ResponsiveFormOverlay.Title>
              {editor.id ? "Edit speaker task" : "New speaker task"}
            </ResponsiveFormOverlay.Title>
            <ResponsiveFormOverlay.Description>
              Assigned tasks appear live in each speaker’s portal.
            </ResponsiveFormOverlay.Description>
          </ResponsiveFormOverlay.Header>
          <ResponsiveFormOverlay.Body>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="task-title">Title</FieldLabel>
                <Input
                  id="task-title"
                  value={editor.title}
                  onChange={(event) => set("title", event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="task-description">Instructions</FieldLabel>
                <Textarea
                  id="task-description"
                  rows={3}
                  value={editor.description}
                  onChange={(event) => set("description", event.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="task-kind">Task type</FieldLabel>
                  <Select
                    id="task-kind"
                    value={editor.kind}
                    onChange={(event) => set("kind", event.target.value)}
                  >
                    <option value="confirm">Confirmation</option>
                    <option value="upload">File upload</option>
                    <option value="form">Written response</option>
                    <option value="link">External link</option>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-audience">Assign to</FieldLabel>
                  <Select
                    id="task-audience"
                    value={editor.appliesTo}
                    onChange={(event) => set("appliesTo", event.target.value)}
                  >
                    <option value="accepted">Accepted speakers</option>
                    <option value="all">All speakers</option>
                    <option value="selected">Selected speakers</option>
                  </Select>
                </Field>
              </div>
              {editor.appliesTo === "selected" ? (
                <Field>
                  <FieldLabel>Speakers</FieldLabel>
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                    {profiles.slice().sort((a, b) => a.name.localeCompare(b.name)).map((profile) => (
                      <label key={profile.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editor.speakerUserIds.includes(profile.userId)}
                          onChange={(event) =>
                            set(
                              "speakerUserIds",
                              event.target.checked
                                ? [...new Set([...editor.speakerUserIds, profile.userId])]
                                : editor.speakerUserIds.filter((id) => id !== profile.userId),
                            )
                          }
                        />
                        <span>{profile.name}</span>
                        <span className="text-xs text-muted-foreground">{profile.email}</span>
                      </label>
                    ))}
                  </div>
                  <FieldDescription>{editor.speakerUserIds.length} selected</FieldDescription>
                </Field>
              ) : null}
              {editor.kind === "link" ? (
                <Field>
                  <FieldLabel htmlFor="task-target">Destination URL</FieldLabel>
                  <Input
                    id="task-target"
                    type="url"
                    value={editor.target}
                    onChange={(event) => set("target", event.target.value)}
                    placeholder="https://…"
                    required
                  />
                </Field>
              ) : null}
              {editor.kind === "upload" ? (
                <Field>
                  <FieldLabel htmlFor="task-file-kind">Required file</FieldLabel>
                  <Select
                    id="task-file-kind"
                    value={editor.target || "document"}
                    onChange={(event) => set("target", event.target.value)}
                  >
                    <option value="headshot">Headshot</option>
                    <option value="slides">Slides</option>
                    <option value="document">Document</option>
                  </Select>
                </Field>
              ) : null}
              {editor.kind === "form" ? (
                <Field>
                  <FieldLabel htmlFor="task-prompt">Response prompt</FieldLabel>
                  <Input
                    id="task-prompt"
                    value={editor.responsePrompt}
                    onChange={(event) => set("responsePrompt", event.target.value)}
                    placeholder="Anything we should know about your setup?"
                  />
                  <FieldDescription>Speakers answer this in a long-text field.</FieldDescription>
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="task-due">Due date</FieldLabel>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={editor.dueAt}
                  onChange={(event) => set("dueAt", event.target.value)}
                />
              </Field>
            </FieldGroup>
          </ResponsiveFormOverlay.Body>
          <ResponsiveFormOverlay.Footer>
            <Button type="button" variant="outline" onClick={() => onChange(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !editor.title.trim()}>
              {saving ? "Saving…" : "Save task"}
            </Button>
          </ResponsiveFormOverlay.Footer>
        </form>
      </ResponsiveFormOverlay.Content>
    </ResponsiveFormOverlay.Root>
  );
}

function toLocalDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDue(value?: string) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
