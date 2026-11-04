import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "correct horse battery";

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function registerViaUi(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/i am 16 or older/i).check();
  await page.getByRole("button", { name: /open account/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: /your desk/i })).toBeVisible();
}

async function registerViaApi(context: BrowserContext, name: string, email: string) {
  const response = await context.request.post("/api/auth/register", {
    data: { displayName: name, email, password: PASSWORD, causes: ["climate"], ageConfirmed: true },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("an account, its membership, and its shift survive sign-out and sign-in", async ({ page }) => {
  const email = uniqueEmail("ada");

  await registerViaUi(page, "Ada Lovelace", email);

  // Join a league through the real button.
  await page.goto("/leagues/harbor");
  await expect(page.getByRole("heading", { level: 1, name: /harbor cleanup coalition/i })).toBeVisible();
  await page.getByRole("button", { name: /^join league$/i }).click();
  await expect(page.getByRole("button", { name: /^you're in$/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /your justice points: 25/i })).toBeVisible();

  // Claim a shift in that league.
  const row = page.locator("div.group").filter({ hasText: "Storm-drain stencilling" });
  await row.getByRole("button", { name: /^sign up$/i }).click();
  await expect(row.getByRole("button", { name: /^you're in$/i })).toBeVisible();

  // Refresh: both records come back from SQLite, not browser state.
  await page.reload();
  await expect(page.getByRole("button", { name: /^you're in$/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /your justice points: 25/i })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("Storm-drain stencilling")).toBeVisible();
  await expect(page.getByText(/signed the league charter/i)).toBeVisible();

  // Sign out, then sign back in with the same credentials.
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: /your justice points: 0/i })).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: /your justice points: 25/i })).toBeVisible();
  await expect(page.getByText("Storm-drain stencilling")).toBeVisible();
});

test("two accounts see the same filled spots after refresh", async ({ browser, playwright }) => {
  const baseURL = test.info().project.use.baseURL!;
  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });

  try {
    const emailA = uniqueEmail("grace");
    const emailB = uniqueEmail("katherine");
    await registerViaApi(contextA, "Grace Hopper", emailA);
    await registerViaApi(contextB, "Katherine Johnson", emailB);

    // Both claim the same shift. Signing up also joins the league.
    for (const context of [contextA, contextB]) {
      const response = await context.request.post("/api/shifts/s18/signup");
      expect(response.ok(), await response.text()).toBeTruthy();
    }

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    for (const page of [pageA, pageB]) {
      await page.goto("/dashboard");
      await expect(page.getByText("Bike-to-market ride")).toBeVisible();

      await page.goto("/leagues/spoke");
      const row = page.locator("div.group").filter({ hasText: "Bike-to-market ride" });
      await expect(row).toBeVisible();
    }

    const spotsA = await pageA
      .locator("div.group")
      .filter({ hasText: "Bike-to-market ride" })
      .locator('[aria-label$="spots filled"]')
      .getAttribute("aria-label");
    const spotsB = await pageB
      .locator("div.group")
      .filter({ hasText: "Bike-to-market ride" })
      .locator('[aria-label$="spots filled"]')
      .getAttribute("aria-label");

    expect(spotsA).toBe(spotsB);
    expect(spotsA).toMatch(/^1[1-9] of 15 spots filled$/);

    // A signed-out reader sees the same count, and no personal data.
    const anonymous = await playwright.request.newContext({ baseURL });
    const edition = (await (await anonymous.get("/api/edition")).json()) as {
      shifts: { id: string; filled: number }[];
      me: null;
    };
    expect(edition.me).toBeNull();
    const shift = edition.shifts.find((item) => item.id === "s18")!;
    expect(spotsA).toBe(`${shift.filled} of 15 spots filled`);
    await anonymous.dispose();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("a seeded steward checks a volunteer in and the points stick", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL!;
  const volunteerContext = await browser.newContext({ baseURL });
  const stewardContext = await browser.newContext({ baseURL });

  try {
    await registerViaApi(volunteerContext, "Nia Roberts", uniqueEmail("nia"));
    const signup = await volunteerContext.request.post("/api/shifts/s11/signup");
    expect(signup.ok()).toBeTruthy();

    const steward = await stewardContext.newPage();
    await steward.goto("/login");
    await steward.getByLabel("Email", { exact: true }).fill("steward.harbor.1@justiceleagues.local");
    await steward.getByLabel("Password", { exact: true }).fill("millbrook");
    await steward.getByRole("button", { name: /^sign in$/i }).click();
    await expect(steward).toHaveURL(/\/dashboard$/);

    await steward.goto("/leagues/harbor/steward");
    await expect(steward.getByRole("link", { name: /^steward$/i })).toHaveAttribute("aria-current", "page");

    const row = steward.locator("li").filter({ hasText: "Nia Roberts" });
    await row.getByRole("button", { name: /mark nia roberts attended/i }).click();
    await expect(row).toContainText("24 JP");
    await expect(row).toContainText("attended");

    const volunteer = await volunteerContext.newPage();
    await volunteer.goto("/dashboard");
    await expect(volunteer.getByRole("link", { name: /your justice points: 49/i })).toBeVisible();
    await expect(volunteer.getByText(/attended storm-drain stencilling/i)).toBeVisible();
  } finally {
    await volunteerContext.close();
    await stewardContext.close();
  }
});

test("a filed project becomes a public win only after steward approval", async ({ browser, playwright }) => {
  const baseURL = test.info().project.use.baseURL!;
  const memberContext = await browser.newContext({ baseURL });
  const stewardContext = await browser.newContext({ baseURL });

  try {
    const email = uniqueEmail("filer");
    await registerViaApi(memberContext, "Filer One", email);
    const joined = await memberContext.request.post("/api/leagues/harbor/join");
    expect(joined.ok(), await joined.text()).toBeTruthy();

    const member = await memberContext.newPage();
    await member.goto("/leagues/harbor/impact");
    await member.getByText("File a completed project").click();
    await member.getByLabel("Project title").fill("Lantern repair sweep");
    await member.getByLabel("People").fill("9");
    await member.getByLabel("Volunteer hours").fill("18");
    await member.getByLabel("Measured result").fill("31 lanterns repaired");
    await member
      .getByLabel("What happened")
      .fill("Nine neighbours rewired and repainted the lanterns along the east walk.");
    await member.getByRole("button", { name: /send to the review desk/i }).click();
    await expect(member.getByText("Project filed for steward review")).toBeVisible();

    // Pending projects are not on the public record, and mint nothing.
    const anonymous = await playwright.request.newContext({ baseURL });
    const before = (await (await anonymous.get("/api/edition")).json()) as { wins: { title: string }[] };
    expect(before.wins.some((win) => win.title === "Lantern repair sweep")).toBe(false);
    await anonymous.dispose();

    const steward = await stewardContext.newPage();
    await steward.goto("/login");
    await steward.getByLabel("Email", { exact: true }).fill("steward.harbor.1@justiceleagues.local");
    await steward.getByLabel("Password", { exact: true }).fill("millbrook");
    await steward.getByRole("button", { name: /^sign in$/i }).click();
    await expect(steward).toHaveURL(/\/dashboard$/);

    await steward.goto("/leagues/harbor/steward");
    const card = steward.locator("article").filter({ hasText: "Lantern repair sweep" });
    await expect(card).toContainText("+140 JP");
    await card.getByRole("button", { name: /^approve$/i }).click();
    await card.getByRole("button", { name: /confirm \+140 jp/i }).click();
    await expect(steward.getByText("Project approved")).toBeVisible();

    await member.reload();
    await expect(member.getByText("Lantern repair sweep")).toBeVisible();
    await expect(member.getByText("+140 JP").first()).toBeVisible();
    await expect(member.getByRole("link", { name: /your justice points: 165/i })).toBeVisible();
  } finally {
    await memberContext.close();
    await stewardContext.close();
  }
});

test("a classified is posted, claimed by a neighbour, and closed", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL!;
  const lenderContext = await browser.newContext({ baseURL });
  const borrowerContext = await browser.newContext({ baseURL });

  try {
    await registerViaApi(lenderContext, "Lender One", uniqueEmail("lender"));
    const membership = await lenderContext.request.post("/api/leagues/harbor/join");
    expect(membership.ok(), await membership.text()).toBeTruthy();

    const lender = await lenderContext.newPage();
    await lender.goto("/leagues/harbor/resources");
    await expect(lender.getByRole("heading", { level: 1, name: /harbor cleanup coalition/i })).toBeVisible();

    await lender.getByText("Post an offer or a need").click();
    await lender.getByRole("button", { name: /i have something to lend/i }).click();
    await lender.getByLabel("Title", { exact: true }).fill("Extension ladder for the weekend");
    await lender.getByLabel("Quantity / note").fill("1 ladder · 3.5m");
    await lender.getByLabel("Details").fill("Collect from the chapter cupboard on Saturday morning.");
    await lender.getByRole("button", { name: /pin it to the exchange/i }).click();
    await expect(lender.getByText("Posted to the exchange")).toBeVisible();

    const card = lender.locator("article").filter({ hasText: "Extension ladder for the weekend" });
    await expect(card).toContainText("Offering");

    await registerViaApi(borrowerContext, "Borrower Two", uniqueEmail("borrower"));
    const borrowerJoin = await borrowerContext.request.post("/api/leagues/harbor/join");
    expect(borrowerJoin.ok(), await borrowerJoin.text()).toBeTruthy();

    const borrower = await borrowerContext.newPage();
    await borrower.goto("/leagues/harbor/resources");
    const borrowerCard = borrower.locator("article").filter({ hasText: "Extension ladder for the weekend" });
    await borrowerCard.getByRole("button", { name: /claim this offer/i }).click();
    await expect(borrower.getByText("Claimed — the poster can see your name")).toBeVisible();
    await expect(borrowerCard).toContainText("held by @borrower");

    // The claim is server-authored: the poster sees it after a reload.
    await lender.reload();
    const claimedCard = lender.locator("article").filter({ hasText: "Extension ladder for the weekend" });
    await expect(claimedCard).toContainText("held by @borrower");
    await expect(claimedCard).toContainText("claimed");

    await borrowerCard.getByRole("button", { name: /mark fulfilled/i }).click();
    await expect(borrower.getByText("Classified marked fulfilled")).toBeVisible();
    await expect(borrowerCard).toHaveCount(0);

    await borrower.getByRole("button", { name: /show closed \(1\)/i }).click();
    await expect(borrowerCard).toContainText("fulfilled");
  } finally {
    await lenderContext.close();
    await borrowerContext.close();
  }
});

test("a steward's invitation link brings a neighbour onto the roster", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL!;
  const stewardContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });

  try {
    const steward = await stewardContext.newPage();
    await steward.goto("/login");
    await steward.getByLabel("Email", { exact: true }).fill("steward.harbor.1@justiceleagues.local");
    await steward.getByLabel("Password", { exact: true }).fill("millbrook");
    await steward.getByRole("button", { name: /^sign in$/i }).click();
    await expect(steward).toHaveURL(/\/dashboard$/);

    await steward.goto("/leagues/harbor/steward");
    await steward.getByText("Invite a neighbour").click();
    await steward.getByLabel("Note (optional)").fill("Bring the Tuesday crew");
    await steward.getByRole("button", { name: /mint the invitation/i }).click();
    await expect(steward.getByText("Invitation minted — copy the link now")).toBeVisible();

    const link = await steward.getByLabel("Invitation link").inputValue();
    expect(link).toContain("/join/");

    const guest = await guestContext.newPage();
    await guest.goto(link);
    await expect(guest.getByRole("heading", { level: 1, name: /harbor cleanup coalition/i })).toBeVisible();
    await expect(guest.getByText("Bring the Tuesday crew")).toBeVisible();
    await expect(guest.getByRole("link", { name: /open an account first/i })).toBeVisible();

    await guest.getByRole("link", { name: /open an account first/i }).click();
    await expect(guest).toHaveURL(/\/register\?next=/);
    await guest.getByLabel("Display name").fill("Nia Invited");
    await guest.getByLabel("Email", { exact: true }).fill(uniqueEmail("invitee"));
    await guest.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await guest.getByRole("button", { name: /open account/i }).click();

    await expect(guest).toHaveURL(/\/join\//);
    await guest.getByRole("button", { name: /accept the seat/i }).click();
    await expect(guest).toHaveURL(/\/leagues\/harbor$/);
    await expect(guest.getByRole("link", { name: /your justice points: 25/i })).toBeVisible();
    await expect(guest.getByRole("button", { name: /^you're in$/i }).first()).toBeVisible();

    await guest.goto("/leagues/harbor/members");
    await expect(guest.getByText("Nia Invited")).toBeVisible();

    // The link is spent: a second visitor gets the closed state.
    const secondContext = await browser.newContext({ baseURL });
    try {
      const second = await secondContext.newPage();
      await second.goto(link);
      await expect(second.getByText("This invitation has already been accepted.")).toBeVisible();
    } finally {
      await secondContext.close();
    }
  } finally {
    await stewardContext.close();
    await guestContext.close();
  }
});
