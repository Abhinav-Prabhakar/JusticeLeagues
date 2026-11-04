// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./index";
import { runMigrations } from "./migrate";
import { seedIfEmpty } from "./seed";
import {
  AppError,
  JOIN_POINTS,
  cancelShift,
  cancelShiftAsSteward,
  checkInShift,
  claimResource,
  createInvite,
  createResource,
  createShift,
  expireResource,
  fulfilResource,
  getMe,
  getShiftRoster,
  joinLeague,
  leaveLeague,
  listLeagues,
  listMembers,
  listProjects,
  listResources,
  listShifts,
  listWins,
  previewInvite,
  redeemInvite,
  removeMember,
  releaseResource,
  reviewProject,
  signupShift,
  submitProject,
  updateLeagueSettings,
  updateShift,
} from "./repository";
import { projectPoints } from "../../src/data/projects";

let db: Db;

function makeProfile(id: string, homeNeighborhood: string | null = null) {
  db.prepare(
    "INSERT INTO profiles (id, email, password_hash, handle, display_name, home_neighborhood) VALUES (?, ?, 'x', ?, ?, ?)",
  ).run(id, `${id}@example.com`, id, id, homeNeighborhood);
}

beforeEach(() => {
  db = openDatabase(":memory:");
  runMigrations(db);
  seedIfEmpty(db);
});

describe("seed", () => {
  it("imports the edition and is idempotent", () => {
    expect(listLeagues(db)).toHaveLength(10);
    expect(listShifts(db)).toHaveLength(18);
    expect(listResources(db)).toHaveLength(20);
    expect(seedIfEmpty(db)).toBe(false);
    const harbor = listLeagues(db).find((league) => league.id === "harbor")!;
    expect(harbor.points).toBe(48210);
    expect(harbor.members).toBe(1287);
    expect(harbor.chapters).toHaveLength(3);
    expect(harbor.chapters[0].hood).toBe("Mill River Docks");
  });

  it("chapter points roll up to the league", () => {
    for (const league of listLeagues(db)) {
      expect(league.chapters).toHaveLength(3);
      const chapterTotal = league.chapters.reduce((sum, chapter) => sum + chapter.points, 0);
      expect(chapterTotal).toBe(league.points);
    }
  });
});

describe("membership", () => {
  it("awards points once and keeps the ledger append-only", () => {
    makeProfile("usr_a");

    expect(joinLeague(db, "usr_a", "harbor").awarded).toBe(true);
    expect(joinLeague(db, "usr_a", "harbor").awarded).toBe(false);

    const me = getMe(db, "usr_a");
    expect(me.points).toBe(JOIN_POINTS);
    expect(me.ledger).toHaveLength(1);
    expect(me.memberships[0].status).toBe("active");
    expect(me.memberships[0].chapterId).toBe("ch_harbor");
    expect(me.memberships[0].points).toBe(JOIN_POINTS);

    const league = listLeagues(db).find((item) => item.id === "harbor")!;
    expect(league.points).toBe(48210 + JOIN_POINTS);
    expect(league.members).toBe(1288);
  });

  it("leaving frees the roster spot but does not rewrite history", () => {
    makeProfile("usr_b");
    joinLeague(db, "usr_b", "harbor");
    leaveLeague(db, "usr_b", "harbor");

    const me = getMe(db, "usr_b");
    expect(me.memberships[0].status).toBe("left");
    expect(me.points).toBe(JOIN_POINTS);

    joinLeague(db, "usr_b", "harbor");
    expect(getMe(db, "usr_b").points).toBe(JOIN_POINTS);
  });

  it("refuses a league that is not recruiting", () => {
    makeProfile("usr_c");
    expect(() => joinLeague(db, "usr_c", "ridgeline")).toThrowError(AppError);
  });

  it("auto-joins the league when claiming a shift", () => {
    makeProfile("usr_d");
    const result = signupShift(db, "usr_d", "s11");
    expect(result.autoJoined).toBe(true);
    expect(getMe(db, "usr_d").memberships[0].leagueId).toBe("harbor");
  });

  it("files a member under their home chapter when the league has one", () => {
    makeProfile("usr_home", "nb_city-centre");
    joinLeague(db, "usr_home", "harbor");
    expect(getMe(db, "usr_home").memberships[0].chapterId).toBe("ch_harbor_2");
  });
});

describe("shift capacity", () => {
  it("never oversells, waitlists the overflow, and promotes the first in line", () => {
    const shift = listShifts(db).find((item) => item.id === "s12")!;
    const open = shift.spots - shift.filled;
    expect(open).toBe(3);

    for (let i = 0; i < open; i++) {
      const id = `usr_cap_${i}`;
      makeProfile(id);
      expect(signupShift(db, id, "s12").status).toBe("signed_up");
    }

    makeProfile("usr_late");
    const late = signupShift(db, "usr_late", "s12");
    expect(late).toMatchObject({ status: "waitlisted", filled: shift.spots, position: 1 });
    makeProfile("usr_later");
    expect(signupShift(db, "usr_later", "s12").position).toBe(2);

    expect(listShifts(db).find((item) => item.id === "s12")?.waitlist).toBe(2);
    expect(listShifts(db, "usr_late").find((item) => item.id === "s12")?.waitlistPosition).toBe(1);

    const cancelled = cancelShift(db, "usr_cap_0", "s12");
    expect(cancelled.promoted).toBe(true);
    const promoted = getMe(db, "usr_late").signups.find((signup) => signup.shiftId === "s12")!;
    expect(promoted.status).toBe("reserved");
    expect(signupShift(db, "usr_late", "s12").status).toBe("already");

    cancelShift(db, "usr_late", "s12");
    expect(getMe(db, "usr_later").signups.find((signup) => signup.shiftId === "s12")?.status).toBe("reserved");
  });

  it("lets a waitlisted volunteer leave without taking a spot", () => {
    const shift = listShifts(db).find((item) => item.id === "s12")!;
    for (let i = 0; i < shift.spots - shift.filled; i++) {
      const id = `usr_fill_${i}`;
      makeProfile(id);
      signupShift(db, id, "s12");
    }
    makeProfile("usr_wait");
    signupShift(db, "usr_wait", "s12");
    expect(cancelShift(db, "usr_wait", "s12")).toMatchObject({ signedUp: false, promoted: false });
    expect(getMe(db, "usr_wait").signups.some((signup) => signup.shiftId === "s12")).toBe(false);
  });

  it("sends a returning volunteer to the back of the waitlist", () => {
    const shift = listShifts(db).find((item) => item.id === "s12")!;
    for (let i = 0; i < shift.spots - shift.filled; i++) {
      const id = `usr_queue_fill_${i}`;
      makeProfile(id);
      signupShift(db, id, "s12");
    }

    makeProfile("usr_queue_a");
    expect(signupShift(db, "usr_queue_a", "s12").position).toBe(1);
    makeProfile("usr_queue_b");
    expect(signupShift(db, "usr_queue_b", "s12").position).toBe(2);

    cancelShift(db, "usr_queue_a", "s12");
    expect(signupShift(db, "usr_queue_a", "s12").position).toBe(2);

    cancelShift(db, "usr_queue_a", "s12");
    cancelShift(db, "usr_queue_b", "s12");
  });

  it("treats a repeat signup as a no-op", () => {
    makeProfile("usr_e");
    const first = signupShift(db, "usr_e", "s11");
    const second = signupShift(db, "usr_e", "s11");
    expect(first.status).toBe("signed_up");
    expect(second.status).toBe("already");
    expect(second.filled).toBe(first.filled);
    expect(getMe(db, "usr_e").signups).toHaveLength(1);
  });
});

describe("steward check-in", () => {
  const OWNER = "usr_seed_harbor_1";

  it("awards points once for an attended shift and records hours", () => {
    makeProfile("usr_vol");
    signupShift(db, "usr_vol", "s11");

    const result = checkInShift(db, OWNER, "s11", "usr_vol", "attended");
    expect(result.awarded).toBe(24);

    const me = getMe(db, "usr_vol");
    expect(me.points).toBe(JOIN_POINTS + 24);
    expect(me.signups[0].status).toBe("attended");
    expect(me.ledger.find((entry) => entry.reason.includes("Storm-drain"))?.delta).toBe(24);

    const again = checkInShift(db, OWNER, "s11", "usr_vol", "attended");
    expect(again.awarded).toBe(0);
    expect(getMe(db, "usr_vol").points).toBe(JOIN_POINTS + 24);
  });

  it("records a no-show without minting points, then allows a correction", () => {
    makeProfile("usr_late2");
    signupShift(db, "usr_late2", "s11");

    expect(checkInShift(db, OWNER, "s11", "usr_late2", "no_show").awarded).toBe(0);
    expect(getMe(db, "usr_late2").points).toBe(JOIN_POINTS);

    expect(checkInShift(db, OWNER, "s11", "usr_late2", "attended").awarded).toBe(24);
    expect(getMe(db, "usr_late2").points).toBe(JOIN_POINTS + 24);
  });

  it("locks the record once attendance is filed", () => {
    makeProfile("usr_att");
    signupShift(db, "usr_att", "s11");
    checkInShift(db, OWNER, "s11", "usr_att", "attended");

    expect(() => cancelShift(db, "usr_att", "s11")).toThrowError(/final/);
  });

  it("refuses a member who is not a steward", () => {
    makeProfile("usr_plain");
    joinLeague(db, "usr_plain", "harbor");
    makeProfile("usr_vol2");
    signupShift(db, "usr_vol2", "s11");

    expect(() => checkInShift(db, "usr_plain", "s11", "usr_vol2", "attended")).toThrowError(/steward/);
  });

  it("credits the volunteer's chapter and exposes the sealed roster", () => {
    makeProfile("usr_ch2", "nb_city-centre");
    signupShift(db, "usr_ch2", "s11");
    checkInShift(db, OWNER, "s11", "usr_ch2", "attended");

    expect(getMe(db, "usr_ch2").memberships[0].chapterId).toBe("ch_harbor_2");

    const roster = getShiftRoster(db, OWNER, "s11");
    expect(roster.sealed).toBe(2);
    expect(
      roster.entries.some(
        (entry) => entry.profile.id === "usr_ch2" && entry.status === "attended" && entry.hours === 2,
      ),
    ).toBe(true);
  });

  it("seeds one steward per chapter", () => {
    const members = listMembers(db, "harbor");
    expect(members.filter((member) => member.role === "owner")).toHaveLength(1);
    expect(members.filter((member) => member.role === "steward")).toHaveLength(2);
  });
});

describe("shift authoring", () => {
  const OWNER = "usr_seed_harbor_1";

  it("posts a shift to a chapter and cancels it with its reservations", () => {
    const shift = createShift(db, OWNER, "harbor", {
      chapterId: "ch_harbor_2",
      title: "Lantern walk",
      day: 2,
      time: "18:30",
      duration: "2h",
      capacity: 6,
      place: "City Centre square",
    });

    expect(shift.league).toBe("harbor");
    expect(shift.chapterId).toBe("ch_harbor_2");
    expect(shift.spots).toBe(6);
    expect(shift.time).toBe("18:30");

    makeProfile("usr_newshift");
    signupShift(db, "usr_newshift", shift.id);
    expect(listShifts(db).find((item) => item.id === shift.id)?.filled).toBe(1);

    cancelShiftAsSteward(db, OWNER, shift.id);
    expect(listShifts(db).find((item) => item.id === shift.id)).toBeUndefined();
    expect(getMe(db, "usr_newshift").signups).toHaveLength(0);
  });

  it("refuses a plain member and a chapter from another league", () => {
    makeProfile("usr_plain2");
    joinLeague(db, "usr_plain2", "harbor");

    expect(() =>
      createShift(db, "usr_plain2", "harbor", {
        chapterId: "ch_harbor",
        title: "Unauthorised shift",
        day: 1,
        time: "09:00",
        duration: "2h",
        capacity: 4,
        place: "Dock 4",
      }),
    ).toThrowError(/steward/);

    expect(() =>
      createShift(db, OWNER, "harbor", {
        chapterId: "ch_spoke",
        title: "Wrong chapter",
        day: 1,
        time: "09:00",
        duration: "2h",
        capacity: 4,
        place: "Dock 4",
      }),
    ).toThrowError(/chapter/);
  });
});

describe("project approval", () => {
  const OWNER = "usr_seed_harbor_1";
  const MEMBER = "usr_projector";

  function fileProject() {
    makeProfile(MEMBER);
    joinLeague(db, MEMBER, "harbor");
    return submitProject(db, MEMBER, "harbor", {
      chapterId: "ch_harbor_2",
      title: "Riverfront replanting",
      summary: "Twelve neighbours replanted the east bank with native shrubs over two weekends.",
      occurredOn: "2026-05-04",
      people: 12,
      hours: 30,
      amount: "120 saplings",
      evidenceUrl: "https://example.com/evidence",
    });
  }

  it("files a project as pending, then approval awards its points once", () => {
    const project = fileProject();
    expect(project.status).toBe("submitted");
    expect(project.points).toBe(0);

    const points = projectPoints(project.facts);
    expect(points).toBe(50 + 30 * 4 + 12 * 2);

    const queued = listProjects(db, OWNER, "harbor");
    expect(queued[0]).toMatchObject({ id: project.id, status: "submitted", points: 0 });

    const beforeProjects = listLeagues(db).find((league) => league.id === "harbor")!.projects;
    const approved = reviewProject(db, OWNER, project.id, "approve");
    expect(approved).toMatchObject({ status: "approved", points });
    expect(listLeagues(db).find((league) => league.id === "harbor")!.projects).toBe(beforeProjects + 1);

    const me = getMe(db, MEMBER);
    expect(me.points).toBe(JOIN_POINTS + points);
    expect(me.ledger.filter((entry) => entry.delta === points)).toHaveLength(1);
    expect(listWins(db).some((win) => win.id === project.id)).toBe(true);

    expect(() => reviewProject(db, OWNER, project.id, "approve")).toThrowError(/already been reviewed/);
    expect(getMe(db, MEMBER).points).toBe(JOIN_POINTS + points);
  });

  it("credits project points to the filing chapter", () => {
    const project = fileProject();
    const points = projectPoints(project.facts);

    const before = listLeagues(db)
      .find((league) => league.id === "harbor")!
      .chapters.find((chapter) => chapter.id === "ch_harbor_2")!.points;

    reviewProject(db, OWNER, project.id, "approve");

    const after = listLeagues(db)
      .find((league) => league.id === "harbor")!
      .chapters.find((chapter) => chapter.id === "ch_harbor_2")!.points;
    expect(after).toBe(before + points);
  });

  it("rejects without minting points and keeps it off the public record", () => {
    const project = fileProject();
    const rejected = reviewProject(db, OWNER, project.id, "reject");

    expect(rejected).toMatchObject({ status: "rejected", points: 0 });
    expect(getMe(db, MEMBER).points).toBe(JOIN_POINTS);
    expect(listWins(db).some((win) => win.id === project.id)).toBe(false);
    expect(listProjects(db, OWNER, "harbor")[0].status).toBe("rejected");
  });

  it("refuses non-members, plain members, and stewards from another league", () => {
    const project = fileProject();
    makeProfile("usr_plain_project");
    joinLeague(db, "usr_plain_project", "harbor");

    expect(() => listProjects(db, "usr_plain_project", "harbor")).toThrowError(/steward/);
    expect(() => reviewProject(db, "usr_plain_project", project.id, "approve")).toThrowError(/steward/);
    expect(() => reviewProject(db, "usr_seed_spoke_1", project.id, "approve")).toThrowError(/steward/);

    makeProfile("usr_outsider");
    expect(() =>
      submitProject(db, "usr_outsider", "harbor", {
        chapterId: "ch_harbor_2",
        title: "Unfiled project",
        summary: "Someone who never joined the league should not be able to file this.",
        occurredOn: "2026-05-05",
        people: 2,
        hours: 3,
      }),
    ).toThrowError(/Join the league/);
  });
});

describe("project points", () => {
  it("stays within the published floor and cap", () => {
    expect(projectPoints({ people: 0, hours: 0, amount: "" })).toBe(50);
    expect(projectPoints({ people: 5000, hours: 10000, amount: "" })).toBe(500);
  });
});

describe("resources", () => {
  const STEWARD = "usr_seed_harbor_1";

  function join(id: string) {
    makeProfile(id);
    joinLeague(db, id, "harbor");
  }

  function post(actor = "usr_lender", overrides: Partial<Parameters<typeof createResource>[3]> = {}) {
    return createResource(db, actor, "harbor", {
      chapterId: "ch_harbor_2",
      kind: "offer",
      title: "Ladder and a set of hand tools",
      description: "Borrow for a build day; return swept.",
      quantity: "1 ladder · 12 tools",
      ...overrides,
    });
  }

  it("posts, claims once, and fulfils with claim history intact", () => {
    join("usr_lender");
    join("usr_borrower");

    const resource = post();
    expect(resource).toMatchObject({ status: "open", kind: "offer" });
    expect(resource.createdBy?.id).toBe("usr_lender");
    expect(listResources(db, "harbor").some((item) => item.id === resource.id)).toBe(true);

    expect(() => claimResource(db, "usr_lender", resource.id)).toThrowError(/own listing/);

    const claimed = claimResource(db, "usr_borrower", resource.id);
    expect(claimed.status).toBe("claimed");
    expect(claimed.claimedBy?.id).toBe("usr_borrower");
    expect(() => claimResource(db, "usr_borrower", resource.id)).toThrowError(/no longer open/);

    const fulfilled = fulfilResource(db, "usr_borrower", resource.id);
    expect(fulfilled.status).toBe("fulfilled");

    const claim = db.prepare("SELECT status FROM resource_claims WHERE resource_id = ?").get(resource.id) as {
      status: string;
    };
    expect(claim.status).toBe("fulfilled");
    expect(() => releaseResource(db, "usr_borrower", resource.id)).toThrowError(/not claimed/);
  });

  it("releases a claim back onto the shelf", () => {
    join("usr_lender");
    join("usr_borrower");
    const resource = post();
    claimResource(db, "usr_borrower", resource.id);

    const released = releaseResource(db, "usr_borrower", resource.id);
    expect(released).toMatchObject({ status: "open", claimedBy: null });

    const claim = db.prepare("SELECT status FROM resource_claims WHERE resource_id = ?").get(resource.id) as {
      status: string;
    };
    expect(claim.status).toBe("released");
  });

  it("lets the poster or a steward expire a listing", () => {
    join("usr_lender");
    join("usr_other");
    const own = post();
    expect(expireResource(db, "usr_lender", own.id).status).toBe("expired");

    const other = post("usr_lender", { title: "Six folding tables" });
    expect(() => expireResource(db, "usr_other", other.id)).toThrowError(/steward/);
    expect(expireResource(db, STEWARD, other.id).status).toBe("expired");
  });

  it("refuses non-members, non-owners, and chapters from another league", () => {
    join("usr_lender");
    makeProfile("usr_outsider");
    const resource = post();

    expect(() => claimResource(db, "usr_outsider", resource.id)).toThrowError(/Join the league/);
    expect(() => releaseResource(db, "usr_outsider", resource.id)).toThrowError(/Join the league/);

    join("usr_neighbour");
    expect(() => releaseResource(db, "usr_neighbour", resource.id)).toThrowError(/Only the member/);

    expect(() =>
      createResource(db, "usr_lender", "harbor", {
        chapterId: "ch_spoke",
        kind: "want",
        title: "Wrong chapter",
      }),
    ).toThrowError(/chapter/);
  });
});

describe("invitations", () => {
  const STEWARD = "usr_seed_harbor_1";

  it("mints a single-use link that files the guest under the invited chapter", () => {
    makeProfile("usr_guest");
    const invite = createInvite(db, STEWARD, "harbor", {
      role: "member",
      chapterId: "ch_harbor_2",
      note: "Bring the Tuesday crew",
      days: 7,
    });

    expect(invite.path).toBe(`/join/${invite.token}`);
    const preview = previewInvite(db, invite.token);
    expect(preview).toMatchObject({
      leagueId: "harbor",
      role: "member",
      chapterId: "ch_harbor_2",
      note: "Bring the Tuesday crew",
      status: "open",
    });

    const redeemed = redeemInvite(db, "usr_guest", invite.token);
    expect(redeemed).toMatchObject({ leagueId: "harbor", role: "member", awarded: true });

    const me = getMe(db, "usr_guest");
    const membership = me.memberships.find((item) => item.leagueId === "harbor")!;
    expect(membership).toMatchObject({ role: "member", status: "active", chapterId: "ch_harbor_2" });
    expect(me.points).toBe(JOIN_POINTS);
    expect(previewInvite(db, invite.token).status).toBe("used");

    makeProfile("usr_second");
    expect(() => redeemInvite(db, "usr_second", invite.token)).toThrowError(/already been used/);
  });

  it("upgrades a member to steward but never demotes an existing steward", () => {
    makeProfile("usr_guest");
    const memberInvite = createInvite(db, STEWARD, "harbor", { role: "member", chapterId: "ch_harbor" });
    redeemInvite(db, "usr_guest", memberInvite.token);

    const stewardInvite = createInvite(db, STEWARD, "harbor", { role: "steward", chapterId: "ch_harbor" });
    expect(redeemInvite(db, "usr_guest", stewardInvite.token)).toMatchObject({ role: "steward", awarded: false });
    expect(getMe(db, "usr_guest").memberships[0].role).toBe("steward");

    const plainInvite = createInvite(db, STEWARD, "harbor", { role: "member", chapterId: "ch_harbor" });
    expect(redeemInvite(db, "usr_guest", plainInvite.token).role).toBe("steward");
    expect(getMe(db, "usr_guest").memberships[0].role).toBe("steward");
  });

  it("expires old links and refuses non-stewards or foreign chapters", () => {
    makeProfile("usr_guest");
    const invite = createInvite(db, STEWARD, "harbor", { role: "member", days: 1 });
    db.prepare("UPDATE league_invites SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());

    expect(previewInvite(db, invite.token).status).toBe("expired");
    expect(() => redeemInvite(db, "usr_guest", invite.token)).toThrowError(/expired/);

    joinLeague(db, "usr_guest", "harbor");
    expect(() => createInvite(db, "usr_guest", "harbor", { role: "member" })).toThrowError(/steward/);
    expect(() => createInvite(db, STEWARD, "harbor", { role: "member", chapterId: "ch_spoke" })).toThrowError(
      /chapter/,
    );
  });
});

describe("steward shift editing", () => {
  const OWNER = "usr_seed_harbor_1";

  it("edits a shift and promotes waitlisted volunteers when capacity grows", () => {
    const shift = listShifts(db).find((item) => item.id === "s12")!;
    for (let i = 0; i < shift.spots - shift.filled; i++) {
      makeProfile(`usr_edit_fill_${i}`);
      signupShift(db, `usr_edit_fill_${i}`, "s12");
    }
    makeProfile("usr_edit_wait");
    expect(signupShift(db, "usr_edit_wait", "s12").status).toBe("waitlisted");

    const updated = updateShift(db, OWNER, "s12", {
      chapterId: "ch_harbor_2",
      title: "Riverfront tree planting",
      day: 5,
      time: "09:30",
      duration: "3h",
      capacity: shift.spots + 1,
      place: "East bank footbridge",
    });
    expect(updated).toMatchObject({
      title: "Riverfront tree planting",
      chapterId: "ch_harbor_2",
      time: "09:30",
      dur: "3h",
      place: "East bank footbridge",
      spots: shift.spots + 1,
    });
    expect(updated.waitlist).toBe(0);
    expect(getMe(db, "usr_edit_wait").signups.find((signup) => signup.shiftId === "s12")?.status).toBe("reserved");
  });

  it("refuses a capacity below the spots already taken, and non-stewards", () => {
    expect(() =>
      updateShift(db, OWNER, "s12", {
        chapterId: "ch_harbor",
        title: "Too small",
        day: 5,
        time: "10:00",
        duration: "2h",
        capacity: 2,
        place: "Nowhere",
      }),
    ).toThrowError(/already taken/);

    makeProfile("usr_plain");
    expect(() =>
      updateShift(db, "usr_plain", "s12", {
        chapterId: "ch_harbor",
        title: "Nope",
        day: 5,
        time: "10:00",
        duration: "2h",
        capacity: 20,
        place: "Nowhere",
      }),
    ).toThrowError(/steward/);
  });
});

describe("roster removal", () => {
  it("lets an owner remove a member but protects the owner and other stewards", () => {
    makeProfile("usr_member");
    joinLeague(db, "usr_member", "harbor");

    expect(removeMember(db, "usr_seed_harbor_1", "harbor", "usr_member")).toEqual({ removed: true });
    expect(listMembers(db, "harbor").some((member) => member.profile.id === "usr_member")).toBe(false);

    expect(() => removeMember(db, "usr_seed_harbor_1", "harbor", "usr_seed_harbor_1")).toThrowError(
      /owner cannot be removed/,
    );
    expect(() => removeMember(db, "usr_seed_harbor_2", "harbor", "usr_seed_harbor_1")).toThrowError(
      /owner cannot be removed/,
    );
    expect(() => removeMember(db, "usr_seed_harbor_2", "harbor", "usr_seed_harbor_3")).toThrowError(/Only the owner/);
    expect(removeMember(db, "usr_seed_harbor_1", "harbor", "usr_seed_harbor_2")).toEqual({ removed: true });
  });
});

describe("league settings", () => {
  it("updates identity and recruiting, and only the owner can archive", () => {
    expect(
      updateLeagueSettings(db, "usr_seed_harbor_1", "harbor", {
        name: "Harbor & Mill River Coalition",
        motto: "Leave the water better than we found it.",
        cause: "climate",
        recruiting: false,
      }),
    ).toEqual({ updated: true, archived: false });

    const harbor = listLeagues(db).find((league) => league.id === "harbor")!;
    expect(harbor).toMatchObject({
      name: "Harbor & Mill River Coalition",
      motto: "Leave the water better than we found it.",
      recruiting: false,
    });

    expect(() =>
      updateLeagueSettings(db, "usr_seed_harbor_2", "harbor", {
        name: "Harbor & Mill River Coalition",
        motto: "Leave the water better than we found it.",
        cause: "climate",
        recruiting: false,
        archived: true,
      }),
    ).toThrowError(/Only the league owner/);

    updateLeagueSettings(db, "usr_seed_harbor_1", "harbor", {
      name: "Harbor & Mill River Coalition",
      motto: "Leave the water better than we found it.",
      cause: "climate",
      recruiting: false,
      archived: true,
    });
    expect(listLeagues(db).some((league) => league.id === "harbor")).toBe(false);
  });

  it("keeps settings behind the steward desk", () => {
    makeProfile("usr_plain");
    joinLeague(db, "usr_plain", "harbor");
    expect(() =>
      updateLeagueSettings(db, "usr_plain", "harbor", {
        name: "Hijacked",
        motto: "No.",
        cause: "food",
        recruiting: true,
      }),
    ).toThrowError(/steward/);
  });
});
