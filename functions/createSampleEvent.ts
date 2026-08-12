import { mutation, v } from "@pylonsync/functions";

// One-click filled state for an empty workspace: a two-day sample conference
// with an open CFP, speakers, submissions in every status, a scored review
// round, and a published, content-approved schedule. Everything is inserted
// through the same rows the real flows write, so every screen looks and
// behaves exactly as it would with organic data.

const SPEAKERS = [
  ["Imani", "Brooks", "Fieldnote", "Staff Engineer"],
  ["Petr", "Havel", "Brightline Systems", "Principal Engineer"],
  ["Rosa", "Delgado", "Kestrel Labs", "Head of Platform"],
  ["Yuki", "Tanaka", "Northbeam", "Engineering Manager"],
  ["Owen", "Gallagher", "Straylight", "Co-founder & CTO"],
  ["Amara", "Osei", "Halcyon Works", "Senior ML Engineer"],
  ["Nils", "Bergstrom", "Copperleaf", "Research Engineer"],
  ["Priyanka", "Rao", "Tidewater", "Director of Engineering"],
] as const;

const TALKS = [
  ["Shipping agents without shipping incidents", "accepted", 0],
  ["A field guide to evaluation-driven development", "accepted", 1],
  ["Postgres at the edge: what actually breaks", "accepted", 2],
  ["Designing APIs your future self can extend", "accepted", 3],
  ["The observability stack we wish we'd built first", "submitted", 4],
  ["Type-safe feature flags across five runtimes", "submitted", 5],
  ["Incident reviews people stop dreading", "in_review", 6],
  ["What we learned migrating 400 services", "waitlisted", 7],
] as const;

function isoDay(base: Date, offsetDays: number): string {
  return new Date(base.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export default mutation<{ orgId: string }, { eventId: string }>({
  args: { orgId: v.id("Org") },
  async handler(ctx, args) {
    await ctx.requireMember(args.orgId, { role: ["owner", "admin"] });

    // Five weeks out, Thursday–Friday, so the agenda and CFP windows read as
    // an upcoming event rather than a stale one.
    const start = new Date(Date.now() + 35 * 86_400_000);
    const day1 = isoDay(start, 0);
    const day2 = isoDay(start, 1);

    const eventId = (await ctx.db.unsafe.insert("Event", {
      orgId: args.orgId,
      name: "DevSummit Sample",
      slug: `devsummit-sample-${Math.random().toString(36).slice(2, 7)}`,
      description:
        "A sample event so you can explore smolboard with real-looking data: submissions mid-review, a published schedule, and speakers in every state. Delete it any time from Settings.",
      startDate: `${day1}T00:00:00.000Z`,
      endDate: `${day2}T00:00:00.000Z`,
      timezone: "America/Los_Angeles",
      location: "San Francisco, CA",
      cfpStatus: "open",
      schedulePublished: true,
      // Branded out of the box so the public site demos the hero treatment.
      brandingJson: JSON.stringify({
        accent: "#7c3aed",
        logoUrl:
          "https://cdn.stack0.dev/30d4ac08-ddda-4035-ab78-5a9785c469a7/4a5091be-57e0-47cc-8576-6284863da7cf/devsummit-logo.svg",
        heroUrl:
          "https://cdn.stack0.dev/30d4ac08-ddda-4035-ab78-5a9785c469a7/56d1598b-c7ea-4973-acdb-9a6bdb56883a/devsummit-hero.svg",
        tagline: "Two days of shipping-focused talks and workshops.",
      }),
    })) as string;

    const formId = (await ctx.db.unsafe.insert("SubmissionForm", {
      orgId: args.orgId,
      eventId,
      name: "Call for proposals",
      slug: "cfp",
      description: "Talks, workshops, and lightning sessions for DevSummit.",
      status: "open",
      fieldsJson: [
        {
          type: "select",
          key: "format",
          label: "Session format",
          required: true,
          options: ["Talk (30 min)", "Lightning talk (10 min)", "Workshop (90 min)"],
        },
        {
          type: "select",
          key: "track",
          label: "Track",
          required: true,
          options: ["Engineering", "Product", "Data"],
        },
        { type: "long_text", key: "outline", label: "Rough outline", required: false },
      ],
      routingJson: {
        // op + value, the shape routeSubmission reads. These once said
        // `equals: "Engineering"`, which parsed to an undefined op and sent
        // every submission to the first rule's category.
        rules: [
          { field: "track", op: "equals", value: "Engineering", category: "engineering" },
          { field: "track", op: "equals", value: "Product", category: "product" },
          { field: "track", op: "equals", value: "Data", category: "data" },
        ],
        defaultCategory: "general",
      },
    })) as string;

    const roomIds: string[] = [];
    for (const [name, sortOrder] of [["Main Hall", 0], ["Studio B", 1]] as const) {
      roomIds.push(
        (await ctx.db.unsafe.insert("Room", { orgId: args.orgId, eventId, name, sortOrder })) as string,
      );
    }
    const trackIds: Record<string, string> = {};
    for (const [name, color, sortOrder] of [
      ["Engineering", "#84cc16", 0],
      ["Product", "#38bdf8", 1],
      ["Data", "#f472b6", 2],
    ] as const) {
      trackIds[name] = (await ctx.db.unsafe.insert("Track", {
        orgId: args.orgId,
        eventId,
        name,
        color,
        sortOrder,
      })) as string;
    }

    // Speakers: find-or-create the unclaimed identity, then the event profile.
    const userIds: string[] = [];
    for (const [first, last, company, title] of SPEAKERS) {
      const email = `${first.toLowerCase()}.${last.toLowerCase()}@sample.smolboard.dev`;
      const existing = await ctx.db.unsafe.query("User", { email });
      const userId = (existing[0]?.id ??
        (await ctx.db.unsafe.insert("User", { email, displayName: `${first} ${last}` }))) as string;
      userIds.push(userId);
      await ctx.db.unsafe.insert("SpeakerProfile", {
        orgId: args.orgId,
        eventId,
        userId,
        name: `${first} ${last}`,
        email,
        company,
        jobTitle: title,
        bio: `${first} works on developer-facing systems at ${company} and speaks about the practical side of running them in production.`,
        status: "confirmed",
        claimStatus: "unclaimed",
      });
    }

    // Submissions across the pipeline, then a scored round.
    const roundId = (await ctx.db.unsafe.insert("ReviewRound", {
      orgId: args.orgId,
      eventId,
      roundNumber: 1,
      name: "Round 1",
      status: "open",
      anonymized: false,
      revealPeerReviews: true,
      criteriaJson: [
        { key: "relevance", label: "Relevance", type: "numeric", min: 1, max: 5, weight: 2 },
        { key: "clarity", label: "Clarity", type: "numeric", min: 1, max: 5, weight: 1 },
      ],
    })) as string;

    const track = (i: number) => ["Engineering", "Product", "Data"][i % 3];
    const submissionIds: string[] = [];
    for (const [title, status, speakerIndex] of TALKS) {
      const id = (await ctx.db.unsafe.insert("Submission", {
        orgId: args.orgId,
        eventId,
        formId,
        speakerUserId: userIds[speakerIndex],
        title,
        abstract: `A practical session on ${title.toLowerCase()} — what worked, what failed, and what we'd do differently.`,
        answersJson: { format: "Talk (30 min)", track: track(speakerIndex) },
        category: track(speakerIndex).toLowerCase(),
        status,
      })) as string;
      submissionIds.push(id);
      if (status === "accepted" || status === "in_review") {
        const score = status === "accepted" ? 5 : 3;
        await ctx.db.unsafe.insert("Review", {
          orgId: args.orgId,
          eventId,
          submissionId: id,
          roundId,
          reviewerUserId: ctx.auth.userId,
          scoresJson: { relevance: score, clarity: score - 1 },
          comment:
            status === "accepted"
              ? "Clear narrative with concrete takeaways. Strong fit."
              : "Promising, but the outline needs a sharper second half.",
          recommendation: status === "accepted" ? "accept" : "neutral",
        });
      }
    }

    // Schedule the accepted talks (content-approved so they're public), plus
    // a keynote slot and a break, across both days.
    const times: Array<[string, string, string, number, string]> = [
      [`${day1}T17:00:00.000Z`, `${day1}T17:30:00.000Z`, "Engineering", 0, "talk"],
      [`${day1}T17:45:00.000Z`, `${day1}T18:15:00.000Z`, "Data", 1, "talk"],
      [`${day1}T18:15:00.000Z`, `${day1}T19:15:00.000Z`, "Engineering", -1, "break"],
      [`${day2}T17:00:00.000Z`, `${day2}T17:30:00.000Z`, "Engineering", 2, "talk"],
      [`${day2}T17:45:00.000Z`, `${day2}T18:15:00.000Z`, "Product", 3, "talk"],
    ];
    let acceptedIndex = 0;
    for (const [startTime, endTime, trackName, talkIndex, kind] of times) {
      const isBreak = talkIndex < 0;
      const talk = isBreak ? null : TALKS[talkIndex];
      const title = isBreak ? "Lunch break" : talk![0];
      const speakers = isBreak ? [] : [userIds[talk![2]]];
      const sessionId = (await ctx.db.unsafe.insert("Session", {
        orgId: args.orgId,
        eventId,
        submissionId: isBreak ? undefined : submissionIds[talkIndex],
        title,
        description: isBreak ? undefined : `With ${SPEAKERS[talk![2]][0]} ${SPEAKERS[talk![2]][1]}.`,
        roomId: roomIds[acceptedIndex % roomIds.length],
        trackId: isBreak ? undefined : trackIds[trackName],
        startTime,
        endTime,
        speakerUserIdsJson: speakers,
        kind,
        contentStatus: "draft",
      })) as string;
      const revisionId = (await ctx.db.unsafe.insert("SessionContentRevision", {
        orgId: args.orgId,
        eventId,
        sessionId,
        revisionNumber: 1,
        title,
        // Must match the session row above; these disagreed, so restoring
        // revision 1 silently rewrote the visible abstract.
        description: isBreak ? undefined : `With ${SPEAKERS[talk![2]][0]} ${SPEAKERS[talk![2]][1]}.`,
        speakerUserIdsJson: speakers,
        editorUserId: ctx.auth.userId,
        editorName: "Sample data",
      })) as string;
      await ctx.db.unsafe.update("Session", sessionId, {
        currentRevisionId: revisionId,
        contentStatus: "approved",
        approvedRevisionId: revisionId,
        approvedAt: new Date().toISOString(),
        approvedByUserId: ctx.auth.userId,
      });
      acceptedIndex += 1;
    }

    // Onboarding tasks for the accepted speakers.
    const templateId = (await ctx.db.unsafe.insert("TaskTemplate", {
      orgId: args.orgId,
      eventId,
      title: "Upload final slides",
      description: "PDF or PowerPoint, 16:9.",
      kind: "upload",
      target: "slides",
      appliesTo: "accepted",
      sortOrder: 0,
    })) as string;
    for (const [, status, speakerIndex] of TALKS) {
      if (status !== "accepted") continue;
      await ctx.db.unsafe.insert("SpeakerTask", {
        orgId: args.orgId,
        eventId,
        taskTemplateId: templateId,
        speakerUserId: userIds[speakerIndex],
        status: "pending",
      });
    }

    return { eventId };
  },
});
