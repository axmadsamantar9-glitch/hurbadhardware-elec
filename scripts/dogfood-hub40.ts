/**
 * Dogfood entrypoint for HUB-40 (Payment System: gateway adapters,
 * initiate/status/callback API routes, reconciliation + FX-rate crons,
 * admin payment review).
 *
 * Scope note: mirrors scripts/dogfood-hub39.ts's established pattern -- this
 * exercises the auth/validation BOUNDARY of the new HTTP surface (every
 * unauthenticated/unauthorized/malformed request is rejected correctly), not
 * a live end-to-end payment flow. A real gateway round-trip genuinely cannot
 * be dogfooded without live sandbox credentials (eDahab has no documented
 * sandbox at all; WaafiPay's production base URL is still unconfirmed -- see
 * docs/agents/run-state.md Active Decisions #6-7), so that gap is reported
 * to production-readiness-gate rather than silently skipped or faked here.
 * The actual settlement logic (guarded-update dedup, stock restoration, the
 * callback-vs-cron race) is proven separately by
 * src/lib/payments/settle.live.test.ts against a real database -- this
 * script only proves the HTTP layer's auth/validation boundary is wired up
 * in a running server.
 *
 * Starts the dev server, waits for /api/health, then:
 *   1. Unauthenticated POST /api/payments/initiate -> 401.
 *   2. Unauthenticated GET /api/payments/status/<id> -> 401.
 *   3. GET /api/cron/fx-rates with NO Authorization header -> 401.
 *   4. GET /api/cron/fx-rates with a WRONG Bearer token -> 401.
 *   5. GET /api/cron/reconcile with NO Authorization header -> 401.
 *   6. GET /api/cron/reconcile with a WRONG Bearer token -> 401.
 *   7. POST /api/payments/callback/<unknown-gateway> -> 400.
 *   8. POST /api/payments/callback/waafipay with no signature headers -> 401
 *      (fail-closed: src/lib/payments/waafipay.ts's validateCallback()
 *      rejects whenever the signature/timestamp/event-id headers are
 *      missing, regardless of whether WAAFIPAY_WEBHOOK_SECRET is configured).
 *   9. POST /api/payments/callback/paystack with no signature header -> 401
 *      (same fail-closed guarantee, independent adapter).
 *
 * Exits 0 on success, non-zero on failure.
 */

import { spawn, type ChildProcess } from "child_process";

const PREFIX = "[dogfood-hub40]";
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

    await check("Unauthenticated POST /api/payments/initiate returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/payments/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "does-not-matter" }),
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await check("Unauthenticated GET /api/payments/status/<orderId> returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/payments/status/nonexistent-order-id`);
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await check("GET /api/cron/fx-rates with no Authorization header returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/cron/fx-rates`);
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await check("GET /api/cron/fx-rates with a wrong Bearer token returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/cron/fx-rates`, {
        headers: { authorization: "Bearer wrong-secret-value" },
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await check("GET /api/cron/reconcile with no Authorization header returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/cron/reconcile`);
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await check("GET /api/cron/reconcile with a wrong Bearer token returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/cron/reconcile`, {
        headers: { authorization: "Bearer wrong-secret-value" },
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await check("POST /api/payments/callback/<unknown-gateway> returns 400", async () => {
      const res = await fetch(`${BASE_URL}/api/payments/callback/notarealgateway`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await check(
      "POST /api/payments/callback/waafipay with no signature headers returns 401 (fail-closed)",
      async () => {
        const res = await fetch(`${BASE_URL}/api/payments/callback/waafipay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: { referenceId: "order-doesnt-matter" } }),
        });
        assert(res.status === 401, `Expected 401, got ${res.status}`);
      }
    );

    await check(
      "POST /api/payments/callback/paystack with no signature header returns 401 (fail-closed)",
      async () => {
        const res = await fetch(`${BASE_URL}/api/payments/callback/paystack`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { reference: "order-doesnt-matter" } }),
        });
        assert(res.status === 401, `Expected 401, got ${res.status}`);
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
