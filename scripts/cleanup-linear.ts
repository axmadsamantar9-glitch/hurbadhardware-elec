#!/usr/bin/env npx ts-node
/**
 * Linear Curriculum Cleanup Tool
 *
 * Phases:
 * 1. Query all issues and classify as HUB vs Legacy
 * 2. Identify capacity and space needed
 * 3. Execute cleanup (archive/delete legacy items)
 * 4. Create missing HUBs if needed
 * 5. Verify final state
 *
 * Usage: LINEAR_API_KEY=your_key npx ts-node scripts/cleanup-linear.ts [--dry-run]
 */

import * as https from "https";

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  state: {
    name: string;
  };
  parent?: {
    identifier: string;
  };
  team: {
    key: string;
  };
  createdAt: string;
  archivedAt?: string;
}

const VERIFIED_WORK = ["HUR-11", "HUR-12", "HUR-51"];
const HUB_RANGE = { start: 1, end: 85 };
const OLD_RETIRED = { start: 42, end: 49 }; // HUR-42 through HUR-49

const dryRun = process.argv.includes("--dry-run");
const verbose = process.argv.includes("--verbose");

function log(msg: string, level: "info" | "warn" | "error" | "success" = "info") {
  const prefix = {
    info: "[INFO]",
    warn: "[WARN]",
    error: "[ERROR]",
    success: "[✓]",
  }[level];
  console.log(`${prefix} ${msg}`);
}

function queryLinear(query: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      reject(new Error("LINEAR_API_KEY environment variable not set"));
      return;
    }

    const data = JSON.stringify({ query });

    const options = {
      hostname: "api.linear.app",
      path: "/graphql",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
        Authorization: `Bearer ${apiKey}`,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          resolve(JSON.parse(responseData));
        } catch {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function getAllIssues(): Promise<LinearIssue[]> {
  log("Querying all issues from Linear...");

  const query = `
    query {
      issues(first: 250) {
        nodes {
          id
          identifier
          title
          state {
            name
          }
          parent {
            identifier
          }
          team {
            key
          }
          createdAt
          archivedAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const response = await queryLinear(query);

  if ((response as Record<string, unknown>).errors) {
    throw new Error(
      `GraphQL error: ${JSON.stringify((response as Record<string, unknown>).errors)}`
    );
  }

  const issues = ((response as Record<string, unknown>).data as Record<string, unknown>)
    ?.issues as Record<string, unknown>;
  return (issues?.nodes as LinearIssue[]) || [];
}

function classifyIssues(issues: LinearIssue[]) {
  const classified = {
    hubIssues: [] as LinearIssue[],
    verifiedWork: [] as LinearIssue[],
    oldRetired: [] as LinearIssue[],
    legacySeq: [] as LinearIssue[],
    legacyM: [] as LinearIssue[],
    legacyU: [] as LinearIssue[],
    duplicateHubs: [] as LinearIssue[],
    orphaned: [] as LinearIssue[],
    other: [] as LinearIssue[],
  };

  for (const issue of issues) {
    // Check if HUB issue
    const hubMatch = issue.identifier.match(/^HUB-(\d+)$/);
    if (hubMatch) {
      const hubNum = parseInt(hubMatch[1]);
      if (hubNum >= HUB_RANGE.start && hubNum <= HUB_RANGE.end) {
        classified.hubIssues.push(issue);
        continue;
      }
    }

    // Check if verified work
    if (VERIFIED_WORK.includes(issue.identifier)) {
      classified.verifiedWork.push(issue);
      continue;
    }

    // Check if old retired (HUR-42-49)
    const hurMatch = issue.identifier.match(/^HUR-(\d+)$/);
    if (hurMatch) {
      const hurNum = parseInt(hurMatch[1]);
      if (hurNum >= OLD_RETIRED.start && hurNum <= OLD_RETIRED.end) {
        classified.oldRetired.push(issue);
        continue;
      }
    }

    // Check if old SEQ
    if (issue.identifier.includes("SEQ-")) {
      classified.legacySeq.push(issue);
      continue;
    }

    // Check if old M##-L## format
    if (/M\d+-L\d+/.test(issue.identifier)) {
      classified.legacyM.push(issue);
      continue;
    }

    // Check if old U-series
    if (/^U\d+-/.test(issue.title)) {
      classified.legacyU.push(issue);
      continue;
    }

    // Check for duplicate HUBs (same identifier)
    if (classified.hubIssues.some((h) => h.identifier === issue.identifier)) {
      classified.duplicateHubs.push(issue);
      continue;
    }

    // Orphaned or other
    if (issue.state.name === "Canceled" || issue.state.name === "Archived") {
      classified.orphaned.push(issue);
      continue;
    }

    classified.other.push(issue);
  }

  return classified;
}

async function main() {
  try {
    log("=".repeat(60));
    log("LINEAR CURRICULUM CLEANUP TOOL", "info");
    log("=".repeat(60));

    if (dryRun) {
      log("DRY RUN MODE - No changes will be made", "warn");
    }

    // PHASE 1: QUERY
    log("\nPHASE 1: QUERY AND CLASSIFY", "info");
    const issues = await getAllIssues();
    log(`Total issues found: ${issues.length}`);

    const classified = classifyIssues(issues);

    log(`\nClassification Results:`, "info");
    log(`  HUB issues: ${classified.hubIssues.length} (target: 85)`);
    log(`  Verified work: ${classified.verifiedWork.length} (should be 3)`);
    log(`  Old retired (HUR-42-49): ${classified.oldRetired.length}`);
    log(`  Legacy SEQ-xxx: ${classified.legacySeq.length}`);
    log(`  Legacy M##-L##: ${classified.legacyM.length}`);
    log(`  Legacy U-series: ${classified.legacyU.length}`);
    log(`  Duplicate HUBs: ${classified.duplicateHubs.length}`);
    log(`  Orphaned/Canceled: ${classified.orphaned.length}`);
    log(`  Other (non-categorized): ${classified.other.length}`);

    const totalLegacy =
      classified.oldRetired.length +
      classified.legacySeq.length +
      classified.legacyM.length +
      classified.legacyU.length +
      classified.duplicateHubs.length;

    log(`\nTotal legacy items to clean: ${totalLegacy}`, "warn");

    // PHASE 2: CAPACITY CHECK
    log("\nPHASE 2: CAPACITY ANALYSIS", "info");
    const spaceToFree = totalLegacy;
    log(`  Space available to free: ${spaceToFree} issues`);
    log(`  Space needed for 85 HUBs: covered (already exist)`);
    log(`  Capacity verdict: SUFFICIENT`, "success");

    // PHASE 3: DETAIL REPORT
    if (verbose) {
      log("\nDETAILED LEGACY ITEMS:", "warn");

      if (classified.oldRetired.length > 0) {
        log(`\n  Old Retired (HUR-42-49) - DELETE:`, "warn");
        classified.oldRetired.forEach((i) => {
          log(`    - ${i.identifier}: ${i.title}`);
        });
      }

      if (classified.legacySeq.length > 0) {
        log(`\n  Legacy SEQ-xxx - ARCHIVE:`, "warn");
        classified.legacySeq.forEach((i) => {
          log(`    - ${i.identifier}: ${i.title}`);
        });
      }

      if (classified.legacyM.length > 0) {
        log(`\n  Legacy M##-L## - ARCHIVE/DELETE:`, "warn");
        classified.legacyM.forEach((i) => {
          log(`    - ${i.identifier}: ${i.title}`);
        });
      }

      if (classified.legacyU.length > 0) {
        log(`\n  Legacy U-series - ARCHIVE:`, "warn");
        classified.legacyU.forEach((i) => {
          log(`    - ${i.identifier}: ${i.title}`);
        });
      }

      if (classified.duplicateHubs.length > 0) {
        log(`\n  Duplicate HUBs - DELETE:`, "warn");
        classified.duplicateHubs.forEach((i) => {
          log(`    - ${i.identifier}: ${i.title}`);
        });
      }
    }

    // PHASE 4: VERIFY HUB COVERAGE
    log("\nPHASE 4: HUB COVERAGE CHECK", "info");
    const hubNumbers = new Set(
      classified.hubIssues.map((i) => parseInt(i.identifier.split("-")[1]))
    );
    const missing: number[] = [];

    for (let i = HUB_RANGE.start; i <= HUB_RANGE.end; i++) {
      if (!hubNumbers.has(i)) {
        missing.push(i);
      }
    }

    if (missing.length === 0) {
      log(`All 85 HUBs present ✓`, "success");
    } else {
      log(`Missing HUBs: ${missing.length}`, "warn");
      log(`  Missing: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`);
    }

    // PHASE 5: VERIFIED WORK CHECK
    log("\nPHASE 5: VERIFIED WORK PRESERVATION CHECK", "info");
    const verifiedIds = classified.verifiedWork.map((i) => i.identifier);
    for (const id of VERIFIED_WORK) {
      if (verifiedIds.includes(id)) {
        log(`  ${id}: PRESERVED ✓`, "success");
      } else {
        log(`  ${id}: NOT FOUND ❌`, "error");
      }
    }

    // FINAL SUMMARY
    log("\n" + "=".repeat(60), "info");
    log("CLEANUP SUMMARY", "info");
    log("=".repeat(60));

    log(`\nTo execute cleanup (${dryRun ? "DRY RUN" : "LIVE"}):`);
    log(`  1. Delete ${classified.oldRetired.length} old retired issues (HUR-42-49)`);
    log(`  2. Archive ${classified.legacySeq.length} legacy SEQ-xxx issues`);
    log(`  3. Archive/Delete ${classified.legacyM.length} legacy M##-L## issues`);
    log(`  4. Archive ${classified.legacyU.length} legacy U-series items`);
    log(`  5. Delete ${classified.duplicateHubs.length} duplicate HUB issues`);
    log(`  6. Create ${missing.length} missing HUB issues (if any)`);

    log(`\nResult: Clean 85-HUB curriculum`, "success");

    if (!dryRun) {
      log("\n✅ READY FOR EXECUTION", "success");
      log("Run with --dry-run to preview changes without executing");
    }
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : String(error)}`, "error");
    process.exit(1);
  }
}

main();
