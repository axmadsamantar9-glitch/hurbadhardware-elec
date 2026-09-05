/**
 * Dogfood entrypoint for HUB-39 (Order Management: order history, order
 * detail, public order tracking).
 *
 * Scope note: this exercises the NEW HTTP surface HUB-39 introduced --
 * protected-route enforcement on the two account/orders pages, and the
 * public POST /api/track endpoint (validation, generic-404 collapse). It
 * does NOT attempt a full browse -> cart -> checkout -> payment -> order
 * journey: no unified dogfood entrypoint for that full path exists yet
 * anywhere in this repo (scripts/dogfood-{u3,u4,u5,hur51}.ts each cover only
 * their own milestone's surface), building one is a cross-cutting effort
 * spanning cart/checkout/payment-gateways ownership, and payment sandboxes
 * are a documented open risk (eDahab has no sandbox; WaafiPay base URL
 * unconfirmed -- see docs/agents/run-state.md Active Decisions #6-7). That
 * gap is reported to production-readiness-gate rather than silently patched
 * here.
 *
 * Starts the dev server, waits for /api/health, then:
 *   1. Confirms unauthenticated GET /en/account/orders redirects to signin.
 *   2. Confirms unauthenticated GET /en/account/orders/<id> redirects to
 *      signin (same protection as the list page).
 *   3. Confirms the public GET /en/track page renders without auth (200).
 *   4. Confirms POST /api/track rejects a malformed body (400).
 *   5. Confirms POST /api/track returns the generic 404 collapse for a
 *      suffix/email combination that cannot match any real order.
 *
 * Exits 0 on success, non-zero on failure.
 */

import { spawn, type ChildProcess } from "child_process";

const PREFIX = "[dogfood-hub39]";
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

async function main() {
  log("Starting dev server...");
  const shell = process.platform === "win32" ? "cmd" : "sh";
  const shellArgs = process.platform === "win32" ? ["/c", "npm run dev"] : ["-c", "npm run dev"];
  const dev: ChildProcess = spawn(shell, shellArgs, { cwd: process.cwd(), stdio: "pipe" });

  try {
    await waitForServer();

    await check("Unauthenticated GET /en/account/orders redirects to signin", async () => {
      const res = await fetch(`${BASE_URL}/en/account/orders`, { redirect: "manual" });
      assert(res.status >= 300 && res.status < 400, `Expected a redirect, got ${res.status}`);
      const loc = res.headers.get("location") || "";
      assert(loc.includes("signin"), `Expected redirect to signin, got location "${loc}"`);
    });

    await check(
      "Unauthenticated GET /en/account/orders/<id> redirects to signin (same protection as list)",
      async () => {
        const res = await fetch(`${BASE_URL}/en/account/orders/nonexistent-id`, {
          redirect: "manual",
        });
        assert(res.status >= 300 && res.status < 400, `Expected a redirect, got ${res.status}`);
        const loc = res.headers.get("location") || "";
        assert(loc.includes("signin"), `Expected redirect to signin, got location "${loc}"`);
      }
    );

    await check("Public GET /en/track renders without auth", async () => {
      const res = await fetch(`${BASE_URL}/en/track`, { redirect: "manual" });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    await check("POST /api/track rejects a malformed body with 400", async () => {
      const res = await fetch(`${BASE_URL}/api/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIdSuffix: "" }),
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await check(
      "POST /api/track returns the generic 404 collapse for a non-matching suffix/email",
      async () => {
        const res = await fetch(`${BASE_URL}/api/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderIdSuffix: "zzzz-nonexistent",
            email: "no-such-order@example.com",
          }),
        });
        assert(res.status === 404, `Expected 404, got ${res.status}`);
        const body = (await res.json()) as { error?: string };
        assert(
          body.error === "not_found",
          `Expected generic "not_found" error, got ${JSON.stringify(body)}`
        );
      }
    );

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
