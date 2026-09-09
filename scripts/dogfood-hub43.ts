/**
 * Dogfood entrypoint for HUB-43 (Repair Management / RMA: state machine,
 * admin-triggered RMA creation off an eligible claim, admin search + status
 * advancement, read-only customer RMA surface on the warranty detail page).
 *
 * Scope note: mirrors scripts/dogfood-hub42.ts's established pattern -- this
 * exercises the auth/validation BOUNDARY of the new HTTP surface HUB-43
 * introduced (every unauthenticated request to an RMA page or API route is
 * rejected/redirected correctly), not the authenticated business logic
 * (transition validation, timestamp-setting, condition-field gating, IDOR
 * ownership scoping, the P2002-race-to-409 mapping). Those are exhaustively
 * covered with real red/green test coverage in:
 *   - src/lib/rma/transitions.test.ts (state machine, incl. terminal states
 *     REJECTED/COMPLETED, skip-ahead rejection)
 *   - src/lib/rma/api.test.ts (per-transition timestamp precision,
 *     condition-field gating before RECEIVED, IDOR-safe ownership scoping)
 *   - src/app/api/admin/rma/route.test.ts (ADMIN auth gate, RmaError -> HTTP
 *     status mapping, P2002-on-claim_id -> 409 vs P2002-on-other-column ->
 *     500 scoping)
 *   - src/app/api/admin/rma/[id]/route.test.ts (ADMIN auth gate, Zod
 *     validation, illegal-transition rejection)
 * None of the existing dogfood scripts authenticate as a real user/admin (no
 * login+CSRF+session-cookie flow is established anywhere in this repo's
 * dogfood suite), so authenticated RMA flows against real seeded data are out
 * of scope for a dogfood script under the existing convention -- they are
 * already proven at the unit/integration layer above with mocked auth, which
 * is strictly more precise (it can assert exact response bodies, audit-log
 * calls, and Prisma call shapes that an HTTP-only dogfood check cannot). This
 * script's value is proving the real Next.js server actually wires the new
 * routes/pages behind the auth boundary (middleware + requireAdmin()), not
 * just that the mocked unit tests assert 401/403.
 *
 * The two new admin RMA pages (/admin/rma, /admin/rma/[id]) are client
 * components with a client-side session check (same pattern as
 * /admin/warranties), but src/proxy.ts's middleware protects every /admin
 * and /account path at the edge regardless of whether the underlying page is
 * a server or client component -- so an unauthenticated GET still redirects
 * before the client component ever renders.
 *
 * IMPORTANT (found while writing this script, pre-existing and NOT specific
 * to RMA): src/proxy.ts's protected-route check is `pathname.includes("/account")
 * || pathname.includes("/admin")`, which also matches API paths like
 * /api/admin/rma (not just page paths) -- so in a real running server, an
 * unauthenticated request to ANY /api/admin/* route is intercepted by the
 * middleware and gets a 307 redirect to signin, and a request from an
 * authenticated non-admin gets a redirect to "/", BEFORE the route handler's
 * own requireAdmin() check ever runs. The route handler's 401/403 JSON
 * responses (asserted in route.test.ts) are real code paths -- they'd fire
 * for a caller that skips the redirect (redirect: "manual" callers, or a
 * non-browser client using `fetch(..., { redirect: "manual" })`) -- but a
 * plain browser fetch() (default redirect: "follow", as an admin page's own
 * client-side code would use) never observes them; it transparently follows
 * the redirect and lands on the signin HTML page instead. This is the exact
 * same behavior on the pre-existing /api/admin/warranties routes (HUB-42) --
 * confirmed manually, not a regression introduced here. Verified against a
 * live server with `fetch(url, { redirect: "manual" })`, matching what this
 * script asserts below. Flagging this in the QA report as a pre-existing,
 * codebase-wide characteristic worth an architecture decision (should
 * /api/admin/* be excluded from the page-redirect middleware branch and rely
 * solely on each route's own requireAdmin() JSON response?) -- out of scope
 * to silently fix here since it touches every admin API route, not just RMA.
 *
 * Starts the dev server, waits for /api/health, then:
 *   1. Unauthenticated GET /en/admin/rma redirects to signin.
 *   2. Unauthenticated GET /en/admin/rma/<id> redirects to signin.
 *   3. Unauthenticated GET /api/admin/rma redirects to signin (edge
 *      middleware, not route handler) -- matches existing
 *      /api/admin/warranties behavior.
 *   4. Unauthenticated POST /api/admin/rma redirects to signin.
 *   5. Unauthenticated GET /api/admin/rma/<id> redirects to signin.
 *   6. Unauthenticated PATCH /api/admin/rma/<id> redirects to signin.
 *
 * Exits 0 on success, non-zero on failure.
 */

import { spawn, type ChildProcess } from "child_process";

const PREFIX = "[dogfood-hub43]";
const BASE_URL = "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(`${PREFIX} ${message}`);
}

async function waitForServer(maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.status === 200 || res.status === 503) {
        log("Server is ready");
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Server did not start in time");
}

async function check(name: string, run: () => Promise<void>): Promise<void> {
  try {
    log(`Testing: ${name}`);
    await run();
    results.push({ name, passed: true });
    log(`  PASS: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: message });
    log(`  FAIL: ${name} - ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function assertRedirectsToSignin(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
  assert(res.status >= 300 && res.status < 400, `Expected a redirect, got ${res.status}`);
  const loc = res.headers.get("location") || "";
  assert(loc.includes("signin"), `Expected redirect to signin, got location "${loc}"`);
}

async function main() {
  log("Starting dev server...");
  const shell = process.platform === "win32" ? "cmd" : "sh";
  const shellArgs = process.platform === "win32" ? ["/c", "npm run dev"] : ["-c", "npm run dev"];
  const dev: ChildProcess = spawn(shell, shellArgs, { cwd: process.cwd(), stdio: "pipe" });

  try {
    await waitForServer();

    await check("Unauthenticated GET /en/admin/rma redirects to signin", async () => {
      await assertRedirectsToSignin("/en/admin/rma");
    });

    await check("Unauthenticated GET /en/admin/rma/<id> redirects to signin", async () => {
      await assertRedirectsToSignin("/en/admin/rma/nonexistent-id");
    });

    // See the file-header note: real unauthenticated HTTP traffic to
    // /api/admin/* is intercepted by src/proxy.ts's edge middleware (307 to
    // signin) before ever reaching the route handler's own requireAdmin()
    // 401 JSON response -- so that's the behavior asserted here, matching
    // the pre-existing /api/admin/warranties routes.
    await check("Unauthenticated GET /api/admin/rma redirects to signin", async () => {
      await assertRedirectsToSignin("/api/admin/rma");
    });

    await check("Unauthenticated POST /api/admin/rma redirects to signin", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/rma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: "nonexistent-id" }),
        redirect: "manual",
      });
      assert(res.status >= 300 && res.status < 400, `Expected a redirect, got ${res.status}`);
      const loc = res.headers.get("location") || "";
      assert(loc.includes("signin"), `Expected redirect to signin, got location "${loc}"`);
    });

    await check("Unauthenticated GET /api/admin/rma/<id> redirects to signin", async () => {
      await assertRedirectsToSignin("/api/admin/rma/nonexistent-id");
    });

    await check("Unauthenticated PATCH /api/admin/rma/<id> redirects to signin", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/rma/nonexistent-id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REVIEW" }),
        redirect: "manual",
      });
      assert(res.status >= 300 && res.status < 400, `Expected a redirect, got ${res.status}`);
      const loc = res.headers.get("location") || "";
      assert(loc.includes("signin"), `Expected redirect to signin, got location "${loc}"`);
    });

    log(`\nTest Results: ${results.filter((r) => r.passed).length}/${results.length} passed`);

    if (results.some((r) => !r.passed)) {
      log("Failed tests:");
      results.filter((r) => !r.passed).forEach((r) => log(`  - ${r.name}: ${r.error}`));
      process.exit(1);
    }

    log("All tests passed!");
    process.exit(0);
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    dev.kill();
  }
}

main();
