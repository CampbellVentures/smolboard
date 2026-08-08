import type {
  SpeakerFileRow,
  SpeakerProfileRow,
  SpeakerTaskRow,
  SubmissionRow,
  TaskTemplateRow,
} from "./types";

export type TaskDueState = "done" | "overdue" | "due_soon" | "pending";

export function taskDueState(
  task: Pick<SpeakerTaskRow, "status">,
  template: Pick<TaskTemplateRow, "dueAt">,
  now = new Date(),
): TaskDueState {
  if (task.status === "done") return "done";
  if (!template.dueAt) return "pending";
  const due = new Date(template.dueAt).getTime();
  if (!Number.isFinite(due)) return "pending";
  if (due < now.getTime()) return "overdue";
  if (due <= now.getTime() + 3 * 24 * 60 * 60 * 1000) return "due_soon";
  return "pending";
}

export function taskCompletion(tasks: Pick<SpeakerTaskRow, "status">[]) {
  const done = tasks.filter((task) => task.status === "done").length;
  return {
    done,
    total: tasks.length,
    percent: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

export function taskReminderList(
  tasks: SpeakerTaskRow[],
  templates: TaskTemplateRow[],
  now = new Date(),
) {
  const templateById = new Map(templates.map((template) => [template.id, template]));
  return tasks
    .filter((task) => task.status !== "done")
    .map((task) => templateById.get(task.taskTemplateId))
    .filter((template): template is TaskTemplateRow => Boolean(template))
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))
    .map((template) => {
      if (!template.dueAt) return `• ${template.title}`;
      const due = new Date(template.dueAt);
      const prefix = due.getTime() < now.getTime() ? "overdue" : "due";
      return `• ${template.title} (${prefix} ${due.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })})`;
    })
    .join("\n");
}

export interface OnboardingRow {
  userId: string;
  name: string;
  email: string;
  tasksDone: number;
  tasksTotal: number;
  taskPercent: number;
  overdue: number;
  dueSoon: number;
  profileComplete: number;
  profileTotal: number;
  lastActivity?: string;
  state: "complete" | "overdue" | "pending";
}

export function buildOnboardingRows({
  submissions,
  profiles,
  tasks,
  templates,
  files,
  now = new Date(),
}: {
  submissions: SubmissionRow[];
  profiles: SpeakerProfileRow[];
  tasks: SpeakerTaskRow[];
  templates: TaskTemplateRow[];
  files: SpeakerFileRow[];
  now?: Date;
}): OnboardingRow[] {
  const accepted = new Map<string, SubmissionRow>();
  for (const submission of submissions) {
    if (submission.status !== "accepted") continue;
    const previous = accepted.get(submission.speakerUserId);
    if (!previous || (submission.updatedAt ?? submission.submittedAt) > (previous.updatedAt ?? previous.submittedAt)) {
      accepted.set(submission.speakerUserId, submission);
    }
  }
  const profilesByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  const templatesById = new Map(templates.map((template) => [template.id, template]));

  return [...accepted.entries()]
    .map(([userId, submission]) => {
      const profile = profilesByUser.get(userId);
      const speakerTasks = tasks.filter((task) => task.speakerUserId === userId);
      const completion = taskCompletion(speakerTasks);
      const dueStates = speakerTasks.map((task) =>
        taskDueState(task, templatesById.get(task.taskTemplateId) ?? {}, now),
      );
      const hasSlides = files.some((file) => file.userId === userId && file.kind === "slides");
      const profileSignals = [Boolean(profile?.bio?.trim()), Boolean(profile?.headshotFileId), hasSlides];
      const activity = [
        submission.updatedAt ?? submission.submittedAt,
        ...speakerTasks.map((task) => task.completedAt).filter((value): value is string => Boolean(value)),
      ].sort().at(-1);
      const overdue = dueStates.filter((state) => state === "overdue").length;
      const complete = completion.total > 0 && completion.done === completion.total && profileSignals.every(Boolean);
      return {
        userId,
        name: profile?.name ?? "Speaker",
        email: profile?.email ?? "",
        tasksDone: completion.done,
        tasksTotal: completion.total,
        taskPercent: completion.percent,
        overdue,
        dueSoon: dueStates.filter((state) => state === "due_soon").length,
        profileComplete: profileSignals.filter(Boolean).length,
        profileTotal: profileSignals.length,
        lastActivity: activity,
        state: complete ? "complete" : overdue > 0 ? "overdue" : "pending",
      } satisfies OnboardingRow;
    })
    .sort((a, b) => {
      const order = { overdue: 0, pending: 1, complete: 2 };
      return order[a.state] - order[b.state] || a.name.localeCompare(b.name);
    });
}
