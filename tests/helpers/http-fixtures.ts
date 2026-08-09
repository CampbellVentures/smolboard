import { expect } from "bun:test";
import { loopbackRequest } from "./http-request";

const PASSWORD = "Local-characterization-123";

export interface HttpClient {
  readonly baseUrl: string;
  readonly token?: string;
  request(path: string, init?: RequestInit): Promise<Response>;
}

export interface TestIdentity extends HttpClient {
  email: string;
  userId: string;
}

export interface OrgFixture {
  id: string;
  slug: string;
  owner: TestIdentity;
  reviewer: TestIdentity;
  speakers: [TestIdentity, TestIdentity];
  eventId: string;
  eventSlug: string;
  formId: string;
  submissionIds: [string, string];
  profileIds: [string, string];
  taskIds: [string, string];
  roundId: string;
  sessionId: string;
}

export interface TwoOrgFixture {
  a: OrgFixture;
  b: OrgFixture;
}

interface AuthResponse {
  token: string;
  user_id: string;
}

function client(baseUrl: string, token?: string): HttpClient {
  return {
    baseUrl,
    token,
    request(path, init = {}) {
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return loopbackRequest(`${baseUrl}${path}`, { ...init, headers });
    },
  };
}

export function anonymousClient(baseUrl: string): HttpClient {
  return client(baseUrl);
}

export async function jsonRequest<T>(
  actor: HttpClient,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<{ response: Response; body: T }> {
  const response = await actor.request(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = (await response.json().catch(() => null)) as T;
  return { response, body: parsed };
}

async function okJson<T>(actor: HttpClient, path: string, method = "GET", body?: unknown): Promise<T> {
  const result = await jsonRequest<T>(actor, path, method, body);
  if (!result.response.ok) {
    const error = result.body as { error?: { code?: string; message?: string } } | null;
    throw new Error(
      `${method} ${path} failed with ${result.response.status}: ${error?.error?.code ?? "unknown error"}`,
    );
  }
  return result.body;
}

async function register(baseUrl: string, email: string, displayName: string): Promise<TestIdentity> {
  const auth = await okJson<AuthResponse>(anonymousClient(baseUrl), "/api/auth/password/register", "POST", {
    email,
    password: PASSWORD,
    displayName,
  });
  return { ...client(baseUrl, auth.token), email, userId: auth.user_id };
}

async function selectOrg(actor: TestIdentity, orgId: string): Promise<void> {
  await okJson(actor, "/api/auth/select-org", "POST", { orgId });
}

async function createEntity(
  actor: HttpClient,
  entity: string,
  data: Record<string, unknown>,
): Promise<string> {
  const result = await okJson<{ id: string }>(actor, `/api/entities/${entity}`, "POST", data);
  return result.id;
}

async function callFn<T>(actor: HttpClient, name: string, args: Record<string, unknown>): Promise<T> {
  return okJson<T>(actor, `/api/fn/${name}`, "POST", args);
}

async function createOrgFixture(baseUrl: string, scope: string, label: "a" | "b"): Promise<OrgFixture> {
  const prefix = `${scope}-${label}`.replace(/[^a-z0-9-]/g, "-").slice(0, 32);
  const owner = await register(baseUrl, `${prefix}-owner@example.test`, `${label.toUpperCase()} Owner`);
  const org = await okJson<{ id: string }>(owner, "/api/auth/orgs", "POST", {
    name: `${label.toUpperCase()} Characterization Org ${scope}`,
  });
  await selectOrg(owner, org.id);
  const slug = `http-${prefix}`;
  await callFn(owner, "updateOrgSlug", { slug });

  const reviewerEmail = `${prefix}-reviewer@example.test`;
  const invite = await okJson<{ token?: string }>(owner, `/api/auth/orgs/${org.id}/invites`, "POST", {
    email: reviewerEmail,
    role: "member",
  });
  if (!invite.token) {
    throw new Error("Disposable dev auth did not expose an invitation token for deterministic fixtures.");
  }
  const reviewer = await register(baseUrl, reviewerEmail, `${label.toUpperCase()} Reviewer`);
  await okJson(reviewer, `/api/auth/invites/${encodeURIComponent(invite.token)}/accept`, "POST", {});
  await selectOrg(reviewer, org.id);

  const speakerOne = await register(baseUrl, `${prefix}-speaker-1@example.test`, `${label.toUpperCase()} Speaker One`);
  const speakerTwo = await register(baseUrl, `${prefix}-speaker-2@example.test`, `${label.toUpperCase()} Speaker Two`);

  const eventSlug = `event-${prefix}`;
  const eventId = await createEntity(owner, "Event", {
    orgId: org.id,
    name: `${label.toUpperCase()} Test Event`,
    slug: eventSlug,
    cfpStatus: "open",
    schedulePublished: false,
    startDate: "2027-05-12T00:00:00.000Z",
    endDate: "2027-05-14T00:00:00.000Z",
  });
  const formId = await createEntity(owner, "SubmissionForm", {
    orgId: org.id,
    eventId,
    name: "Test CFP",
    slug: "test-cfp",
    status: "open",
    fieldsJson: [],
  });

  const submissionOne = await callFn<{ submissionId: string }>(speakerOne, "submitCfp", {
    formId,
    name: `${label.toUpperCase()} Speaker One`,
    email: speakerOne.email,
    title: `${label.toUpperCase()} Speaker One Talk`,
    abstract: "First characterization abstract.",
    answers: {},
  });
  const submissionTwo = await callFn<{ submissionId: string }>(speakerTwo, "submitCfp", {
    formId,
    name: `${label.toUpperCase()} Speaker Two`,
    email: speakerTwo.email,
    title: `${label.toUpperCase()} Speaker Two Talk`,
    abstract: "Second characterization abstract.",
    answers: {},
  });

  const profiles = await okJson<{ data: { id: string; userId: string }[] }>(
    owner,
    "/api/entities/SpeakerProfile",
  );
  const profileOne = profiles.data.find((row) => row.userId === speakerOne.userId);
  const profileTwo = profiles.data.find((row) => row.userId === speakerTwo.userId);
  expect(profileOne).toBeDefined();
  expect(profileTwo).toBeDefined();

  const templateId = await createEntity(owner, "TaskTemplate", {
    orgId: org.id,
    eventId,
    title: "Confirm participation",
    kind: "confirm",
    appliesTo: "all",
  });
  const taskOne = await createEntity(owner, "SpeakerTask", {
    orgId: org.id,
    eventId,
    taskTemplateId: templateId,
    speakerUserId: speakerOne.userId,
    status: "pending",
  });
  const taskTwo = await createEntity(owner, "SpeakerTask", {
    orgId: org.id,
    eventId,
    taskTemplateId: templateId,
    speakerUserId: speakerTwo.userId,
    status: "pending",
  });
  const roundId = await createEntity(owner, "ReviewRound", {
    orgId: org.id,
    eventId,
    roundNumber: 1,
    name: "Initial Review",
    criteriaJson: [{ key: "quality", label: "Quality", max: 5 }],
    status: "open",
  });

  const roomId = await createEntity(owner, "Room", {
    orgId: org.id,
    eventId,
    name: "Main Room",
    sortOrder: 0,
  });
  const trackId = await createEntity(owner, "Track", {
    orgId: org.id,
    eventId,
    name: "Platform",
    sortOrder: 0,
  });
  const sessionId = await createEntity(owner, "Session", {
    orgId: org.id,
    eventId,
    submissionId: submissionOne.submissionId,
    title: `${label.toUpperCase()} Published Session`,
    roomId,
    trackId,
    startTime: "2027-05-12T17:00:00.000Z",
    endTime: "2027-05-12T17:30:00.000Z",
    speakerUserIdsJson: [speakerOne.userId],
    kind: "talk",
  });

  return {
    id: org.id,
    slug,
    owner,
    reviewer,
    speakers: [speakerOne, speakerTwo],
    eventId,
    eventSlug,
    formId,
    submissionIds: [submissionOne.submissionId, submissionTwo.submissionId],
    profileIds: [profileOne!.id, profileTwo!.id],
    taskIds: [taskOne, taskTwo],
    roundId,
    sessionId,
  };
}

export async function createTwoOrgFixture(baseUrl: string, scope: string): Promise<TwoOrgFixture> {
  const [a, b] = await Promise.all([
    createOrgFixture(baseUrl, scope, "a"),
    createOrgFixture(baseUrl, scope, "b"),
  ]);
  return { a, b };
}

export async function entityList<T>(actor: HttpClient, entity: string): Promise<T[]> {
  const result = await okJson<{ data: T[] }>(actor, `/api/entities/${entity}`);
  return result.data;
}

export async function entityUpdate(
  actor: HttpClient,
  entity: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<Response> {
  return actor.request(`/api/entities/${entity}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function publicFn<T>(
  baseUrl: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ response: Response; body: T }> {
  return jsonRequest<T>(anonymousClient(baseUrl), `/api/fn/${name}`, "POST", args);
}
