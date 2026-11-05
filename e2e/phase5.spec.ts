import { expect, test, type BrowserContext } from "@playwright/test";

const PASSWORD = "correct horse battery";
const EDITOR = "admin@justiceleagues.local";

function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function registerViaApi(
  context: BrowserContext,
  name: string,
  email: string,
  extra: Record<string, unknown> = {},
) {
  const response = await context.request.post("/api/auth/register", {
    data: { displayName: name, email, password: PASSWORD, causes: ["climate"], ageConfirmed: true, ...extra },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { me: { profile: { id: string } } };
}

async function signInViaApi(context: BrowserContext, email: string, password: string) {
  const response = await context.request.post("/api/auth/login", { data: { email, password } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function joinHarbor(context: BrowserContext) {
  const response = await context.request.post("/api/leagues/harbor/join", {});
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("a new account gets a welcome notice and can clear the unread count", async ({ page }) => {
  const email = uniqueEmail("inbox");
  await registerViaApi(page.context(), "Inbox Reader", email);

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 1, name: /your inbox/i })).toBeVisible();
  await expect(page.getByText("Welcome to the Leagues")).toBeVisible();
  await expect(page.getByRole("link", { name: /your inbox: 1 unread/i })).toBeVisible();

  await page.getByRole("button", { name: /mark all read/i }).click();
  await expect(page.locator('a[aria-label="Your inbox"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /mark all read/i })).toBeDisabled();

  await page.getByRole("button", { name: /^unread$/i }).click();
  await expect(page.getByText("Nothing unread.")).toBeVisible();
});

test("a reported resource leaves the exchange after the editor hides it", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL!;
  const authorContext = await browser.newContext({ baseURL });
  const reporterContext = await browser.newContext({ baseURL });
  const editorContext = await browser.newContext({ baseURL });

  try {
    const title = `Reported trailer ${Date.now()}`;
    await registerViaApi(authorContext, "Report Author", uniqueEmail("author"));
    await joinHarbor(authorContext);
    const created = await authorContext.request.post("/api/leagues/harbor/resources", {
      data: { chapterId: "ch_harbor", kind: "offer", title, description: "Left behind the depot." },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    await registerViaApi(reporterContext, "Report Reader", uniqueEmail("reporter"));
    await joinHarbor(reporterContext);

    const reporter = await reporterContext.newPage();
    await reporter.goto("/leagues/harbor/resources");
    const card = reporter.locator("main article").filter({ hasText: title });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: `Report “${title}”` }).click();

    const dialog = reporter.getByRole("dialog");
    await dialog.getByLabel("What is wrong?").selectOption("spam");
    await dialog.getByLabel(/anything else/i).fill("Looks like a scrap listing.");
    await dialog.getByRole("button", { name: /send to the editor/i }).click();
    await expect(dialog).toBeHidden();
    await expect(reporter.getByText(/report filed/i)).toBeVisible();

    await signInViaApi(editorContext, EDITOR, "millbrook");
    const editor = await editorContext.newPage();
    await editor.goto("/admin?tab=reports");
    const queueCard = editor.locator("main article").filter({ hasText: title });
    await expect(queueCard).toBeVisible();
    await queueCard.getByLabel(/note to the author/i).fill("Not a real offer.");
    await queueCard.getByRole("button", { name: /hide item/i }).click();
    await expect(queueCard).toBeHidden();

    await editor.getByRole("button", { name: /^actioned$/i }).click();
    await expect(editor.locator("main article").filter({ hasText: title })).toContainText("Not a real offer.");

    await reporter.goto("/leagues/harbor/resources");
    await expect(reporter.locator("main article").filter({ hasText: title })).toHaveCount(0);
  } finally {
    await authorContext.close();
    await reporterContext.close();
    await editorContext.close();
  }
});

test("a 16-year-old can join, but their handle and email stay private", async ({ browser, page }) => {
  const baseURL = test.info().project.use.baseURL!;
  const email = uniqueEmail("teen");
  const name = `Young Neighbour ${Date.now()}`;

  await page.goto("/register");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/i am 16 or older/i).check();
  await page.getByRole("radio", { name: /i'm 16 or 17/i }).click();
  await page.getByLabel(/a parent or guardian consents/i).check();
  await page.getByRole("button", { name: /open account/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/leagues/harbor");
  await page.getByRole("button", { name: /^join league$/i }).click();
  await expect(page.getByRole("button", { name: /^you're in$/i }).first()).toBeVisible();

  await page.goto("/leagues/harbor/members");
  const rosterRow = page.locator("main li").filter({ hasText: name });
  await expect(rosterRow).toBeVisible();
  await expect(rosterRow).not.toContainText(email);
  await expect(rosterRow).not.toContainText("@");

  const editorContext = await browser.newContext({ baseURL });
  try {
    await signInViaApi(editorContext, EDITOR, "millbrook");
    const editor = await editorContext.newPage();
    await editor.goto("/admin?tab=people");
    await editor.getByLabel(/find a neighbour/i).fill(email);
    const person = editor.locator("main li").filter({ hasText: name });
    await expect(person).toBeVisible();
    await expect(person).toContainText("handle private");
    await expect(person).toContainText("contact via steward");
    await expect(person).not.toContainText(email);
  } finally {
    await editorContext.close();
  }
});

test("the new desk pages fit a phone", async ({ browser, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ["/privacy", "/terms", "/register"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(1);
  }

  const baseURL = test.info().project.use.baseURL!;
  const editorContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    await signInViaApi(editorContext, EDITOR, "millbrook");
    const editor = await editorContext.newPage();
    for (const path of ["/inbox", "/admin", "/admin?tab=reports", "/admin?tab=people"]) {
      await editor.goto(path);
      await expect(editor.locator("main")).toBeVisible();
      const overflow = await editor.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  } finally {
    await editorContext.close();
  }
});
