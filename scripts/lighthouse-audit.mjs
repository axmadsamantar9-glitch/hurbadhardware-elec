// Plain Node ESM (not .ts/.mts via tsx): Lighthouse serializes page-injected
// functions with `.toString()` and evaluates them in the browser context via
// CDP. tsx's esbuild transform injects an `__name(...)` helper wrapper into
// every function it processes (including lighthouse's own node_modules code)
// but that helper only exists in the transformed module's local scope, not
// in the browser page — causing "__name is not defined" at runtime. Running
// this as untransformed plain JS avoids that entirely. Keep this script
// plain JS; do not convert back to .ts run via tsx.
import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const PREFIX = "[lighthouse-audit]";

// PRD U21 target page (`/[locale]/products`) does not exist yet — Module 05.
// This list is every page that currently exists in the app router, per
// HUB-24's confirmed scope. Update this list as new pages ship.
//
// Bare "/" is intentionally excluded: it is next-intl's locale-detection
// route (307 redirect to /en or /so + a Set-Cookie), and navigating headless
// Chrome to it via the Lighthouse/CDP API hangs indefinitely (Page.navigate
// never resolves, reproduced consistently with both --headless and
// --headless=new, with and without an explicit maxWaitForLoad override) even
// though the same redirect completes in <50ms via curl. This is a narrow
// automation limitation of auditing a redirect-only route, not an app
// performance issue — "/en" and "/so" below audit the actual rendered
// homepage content the redirect lands on. See
// docs/standards/performance-testing.md for detail.
const PAGES = ["/en", "/so", "/en/auth/signin", "/en/auth/register", "/en/account", "/en/admin"];

const PORT = 3000;

// Default: audit the dev server (fast, no build step). Pass --production
// (or set LIGHTHOUSE_SERVER=production) to audit `next build && next start`
// instead — dev mode is unminified/unbundled and is NOT representative of
// the production Performance score; use --production for the number that
// matters against the PRD's >=85 target.
const SERVER_MODE =
  process.argv.includes("--production") || process.env.LIGHTHOUSE_SERVER === "production"
    ? "production"
    : "dev";
const SERVER_COMMAND =
  SERVER_MODE === "production" ? "npm run build && npm run start" : "npm run dev";

const REPORT_DIR = path.join(process.cwd(), "reports", "lighthouse", SERVER_MODE);

function log(message) {
  console.log(`${PREFIX} ${message}`);
}

// The server is spawned via a shell wrapper (`cmd /c "npm run dev"` /
// `sh -c "npm run dev"`), which on Windows means dev.kill() only kills the
// cmd.exe wrapper, NOT the grandchild `next-server`/npm process it spawned —
// that process is left running and holding port 3000, breaking every
// subsequent run until manually taskkill'd. Use `taskkill /T /F` (kills the
// whole process tree) on Windows; plain kill() is sufficient on POSIX where
// the shell wrapper properly forwards signals to its child.
function killServerTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill();
  }
}

async function waitForServer(port, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/api/health`, (res) => {
          if (res.statusCode === 200 || res.statusCode === 503) resolve(undefined);
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on("error", reject);
        req.setTimeout(1000);
      });
      log("Server is ready");
      return;
    } catch {
      if (i === maxRetries - 1) throw new Error("Server did not start in time");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function auditPage(urlPath, chrome) {
  const url = `http://localhost:${PORT}${urlPath}`;
  log(`Auditing ${url} ...`);
  try {
    // No config overrides: Lighthouse's own defaultSettings already are
    // formFactor: 'mobile' + throttling.mobileSlow4G (see
    // node_modules/lighthouse/core/config/constants.js). This is the
    // documented substitute for "East African network conditions" since the
    // PRD specifies no numeric 3G/4G bandwidth/RTT profile — see
    // docs/standards/performance-testing.md.
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
    });

    if (!runnerResult || !runnerResult.lhr) {
      return { url: urlPath, ok: false, error: "Lighthouse returned no result" };
    }

    const { lhr } = runnerResult;

    if (lhr.runtimeError) {
      return {
        url: urlPath,
        ok: false,
        error: `Runtime error: ${lhr.runtimeError.code} - ${lhr.runtimeError.message}`,
      };
    }

    const scores = {
      performance: lhr.categories.performance?.score ?? null,
      accessibility: lhr.categories.accessibility?.score ?? null,
      bestPractices: lhr.categories["best-practices"]?.score ?? null,
      seo: lhr.categories.seo?.score ?? null,
    };

    const metrics = {
      lcpMs: lhr.audits["largest-contentful-paint"]?.numericValue ?? null,
      cls: lhr.audits["cumulative-layout-shift"]?.numericValue ?? null,
      tbtMs: lhr.audits["total-blocking-time"]?.numericValue ?? null,
    };

    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const fileName = urlPath.replace(/\//g, "_") || "_root";
    fs.writeFileSync(path.join(REPORT_DIR, `${fileName}.json`), JSON.stringify(lhr, null, 2));

    log(
      `  Performance=${scores.performance} A11y=${scores.accessibility} BestPractices=${scores.bestPractices} SEO=${scores.seo}`
    );

    return { url: urlPath, ok: true, scores, metrics };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`  ERROR: ${message}`);
    return { url: urlPath, ok: false, error: message };
  }
}

async function main() {
  log(`Starting ${SERVER_MODE} server ("${SERVER_COMMAND}")...`);
  const shell = process.platform === "win32" ? "cmd" : "sh";
  const shellArgs =
    process.platform === "win32" ? ["/c", SERVER_COMMAND] : ["-c", SERVER_COMMAND];

  const dev = spawn(shell, shellArgs, {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  let chrome;
  const results = [];

  try {
    // Production mode runs a full `next build` first, which can take well
    // over 30s; dev mode is ready almost immediately.
    await waitForServer(PORT, SERVER_MODE === "production" ? 180 : 30);

    log("Launching headless Chrome...");
    chrome = await chromeLauncher.launch({
      // Classic --headless, not --headless=new: the new headless mode
      // (Chrome's default since M112) was observed to hang indefinitely
      // mid-navigation on this Windows/Chrome combination (CDP connection
      // stayed open but never completed Page.navigate) — reproduced
      // reliably against both dev and production servers. Classic headless
      // completed the same audit in ~16s. If upgrading Chrome/chrome-launcher
      // later, re-test --headless=new before switching back.
      chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });

    for (const pagePath of PAGES) {
      const result = await auditPage(pagePath, chrome);
      results.push(result);
    }

    log("\n=== Summary ===");
    for (const r of results) {
      if (r.ok && r.scores) {
        log(
          `${r.url.padEnd(24)} perf=${Math.round((r.scores.performance ?? 0) * 100)} ` +
            `a11y=${Math.round((r.scores.accessibility ?? 0) * 100)} ` +
            `bp=${Math.round((r.scores.bestPractices ?? 0) * 100)} ` +
            `seo=${Math.round((r.scores.seo ?? 0) * 100)} ` +
            `lcp=${r.metrics?.lcpMs ? Math.round(r.metrics.lcpMs) + "ms" : "n/a"} ` +
            `cls=${r.metrics?.cls ?? "n/a"} tbt=${r.metrics?.tbtMs ? Math.round(r.metrics.tbtMs) + "ms" : "n/a"}`
        );
      } else {
        log(`${r.url.padEnd(24)} FAILED: ${r.error}`);
      }
    }

    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, "summary.json"), JSON.stringify(results, null, 2));
    log(`\nFull per-page JSON reports written to ${REPORT_DIR}`);

    const anyFailed = results.some((r) => !r.ok);
    process.exit(anyFailed ? 1 : 0);
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    if (chrome) {
      try {
        await chrome.kill();
      } catch (killError) {
        // chrome-launcher's tmp-dir cleanup can hit a transient Windows
        // EPERM (file still locked by the just-exited chrome.exe process).
        // The Chrome process itself is already gone at this point; only the
        // temp profile dir removal failed, so this is safe to ignore.
        log(
          `Warning: chrome.kill() cleanup error (non-fatal): ${
            killError instanceof Error ? killError.message : String(killError)
          }`
        );
      }
    }
    killServerTree(dev);
  }
}

main();
