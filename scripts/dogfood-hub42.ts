/**
 * Dogfood entrypoint for HUB-42 (Warranty Management: registration snapshot,
 * status derivation, customer claim creation, admin claim state machine +
 * override gate).
 *
 * Scope note: mirrors scripts/dogfood-hub39.ts / dogfood-hub40.ts's
 * established pattern -- this exercises the auth/validation BOUNDARY of the
 * new HTTP surface HUB-42 introduced (every unauthenticated request to a
 * warranty page or API route is rejected/redirected correctly), not the
 * authenticated business logic (claim state machine transitions, the AC7
 * override-reason gate, IDOR ownership scoping). Those are exhaustively
 * covered with real red/green test coverage in:
 *   - src/lib/warranty/status.test.ts (status precedence, incl. VOID+EXPIRED)
 *   - src/lib/warranty/claim-transitions.test.ts (state machine, incl.
 *     skip-ahead/backwards/self-transition rejection)
 *   - src/app/api/admin/warranties/claims/[id]/route.test.ts (AC7 override
 *     gate, incl. whitespace-only overrideReason rejection)
 *   - src/app/api/warranties/[id]/claims/route.test.ts (IDOR 404, field
 *     whitelisting)
 * None of the existing dogfood scripts authenticate as a real user/admin (no
 * login+CSRF+session-cookie flow is established anywhere in this repo's
 * dogfood suite), so "invalid transition -> 400" / "missing overrideReason ->
 * 400" against a real authenticated session and real seeded claim data is out
 * of scope for a dogfood script under the existing convention -- it is
 * already proven at the unit/integration layer above with mocked auth, which
 * is strictly more precise (it can assert exact response bodies, audit-log
 * calls, and Prisma call shapes that an HTTP-only dogfood check cannot).
 *
 * Starts the dev server, waits for /api/health, then:
 *   1. Unauthenticated GET /en/account/warranties redirects to signin.
 *   2. Unauthenticated GET /en/account/warranties/<id> redirects to signin
 *      (same protection as the list page).
 *   3. Unauthenticated GET /en/account/warranties/<id>/claim redirects to
 *      signin.
 *   4. Unauthenticated GET /en/admin/warranties redirects to signin.
 *   5. Unauthenticated GET /en/admin/warranties/claims/<id> redirects to
 *      signin.
 *   6. Unauthenticated POST /api/warranties/<id>/claims returns 401.
 *   7. Unauthenticated GET /api/admin/warranties/claims/<id> returns 401.
 *   8. Unauthenticated PATCH /api/admin/warranties/claims/<id> returns 401.
 *   9. Unauthenticated GET /api/admin/warranties returns 401.
 *   10. Unauthenticated POST /api/admin/warranties/register returns 401.
 *
 * Exits 0 on success, non-zero on failure.
 */

import { spawn, type ChildProcess } from "child_process";

const PREFIX = "[dogfood-hub42]";
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

    await check("Unauthenticated GET /en/account/warranties redirects to signin", async () => {
      await assertRedirectsToSignin("/en/account/warranties");
    });

    await check("Unauthenticated GET /en/account/warranties/<id> redirects to signin", async () => {
      await assertRedirectsToSignin("/en/account/warranties/nonexistent-id");
    });

    await check(
      "Unauthenticated GET /en/account/warranties/<id>/claim redirects to signin",
      async () => {
        await assertRedirectsToSignin("/en/account/warranties/nonexistent-id/claim");
      }
    );

    await check("Unauthenticated GET /en/admin/warranties redirects to signin", async () => {
      await assertRedirectsToSignin("/en/admin/warranties");
    });

    await check(
      "Unauthenticated GET /en/admin/warranties/claims/<id> redirects to signin",
      async () => {
        await assertRedirectsToSignin("/en/admin/warranties/claims/nonexistent-id");
      }
    );

    await check("Unauthenticated POST /api/warranties/<id>/claims returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/warranties/nonexistent-id/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimReason: "Broken" }),
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await check("Unauthenticated GET /api/admin/warranties/claims/<id> returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/warranties/claims/nonexistent-id`);
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await check("Unauthenticated PATCH /api/admin/warranties/claims/<id> returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/warranties/claims/nonexistent-id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ELIGIBILITY_REVIEW" }),
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await check("Unauthenticated GET /api/admin/warranties returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/warranties`);
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await check("Unauthenticated POST /api/admin/warranties/register returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/warranties/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
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
