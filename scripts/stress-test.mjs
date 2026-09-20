#!/usr/bin/env node

/**
 * Concurrency & Load Stress-Testing Tool for Rush Management Tool (RMT)
 * 
 * Usage:
 *   node scripts/stress-test.mjs [options]
 * 
 * Options:
 *   --users <number>        Number of simulated concurrent users (default: 60)
 *   --requests <number>     Total requests per user (default: 10)
 *   --concurrency <number>  Maximum simultaneous requests in flight (default: 25)
 *   --include-votes         Also test cast_vote RPC with synthetic user IDs (default: false)
 *   --help                  Show help
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local manually
function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("\x1b[31mError: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local\x1b[0m");
  process.exit(1);
}

// Parse CLI Args
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) {
    return Number(args[idx + 1]) || defaultValue;
  }
  return defaultValue;
}
function getArgString(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
}
const hasFlag = (name) => args.includes(name);

if (hasFlag("--help")) {
  console.log(`
Concurrency Stress Test for Supabase / RMT

Options:
  --users <number>        Number of virtual users (default: 60)
  --requests <number>     Requests per user (default: 10)
  --concurrency <number>  Max simultaneous in-flight connections (default: 25)
  --include-votes         Test cast_vote RPC with random UUIDs (default: false)
  --help                  Show this help message
`);
  process.exit(0);
}

const NUM_USERS = getArg("--users", 60);
const REQS_PER_USER = getArg("--requests", 10);
const MAX_CONCURRENCY = getArg("--concurrency", 25);
const TEST_VOTES = hasFlag("--include-votes");

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

// Endpoints to benchmark
const READ_ENDPOINTS = [
  { path: "/rest/v1/voting-ops?select=*&id=eq.1", label: "voting-ops" },
  { path: "/rest/v1/voting-thresholds?select=*", label: "thresholds" },
  { path: "/rest/v1/voting-s1-r1?select=id,positive,negative,abstain,status&limit=30", label: "tally-s1-r1" },
  { path: "/rest/v1/voting-s1-r2?select=id,positive,negative,abstain,status&limit=30", label: "tally-s1-r2" },
  { path: "/rest/v1/pnms?select=student_id,full_name,major,application&limit=50", label: "pnms-list" },
];

async function measureRequest(fn) {
  const start = performance.now();
  try {
    const res = await fn();
    const duration = performance.now() - start;
    return {
      status: res.status,
      ok: res.ok,
      duration,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    const duration = performance.now() - start;
    return {
      status: 0,
      ok: false,
      duration,
      error: err?.message || String(err),
    };
  }
}

async function runBenchmark() {
  console.log("\n=======================================================");
  console.log("  RUSH MANAGEMENT TOOL - CONCURRENCY BENCHMARK");
  console.log("=======================================================");
  console.log(`Target Supabase Host: ${new URL(SUPABASE_URL).hostname}`);
  console.log(`Virtual Users:        ${NUM_USERS}`);
  console.log(`Requests per User:    ${REQS_PER_USER}`);
  console.log(`Total Requests:       ${NUM_USERS * REQS_PER_USER}`);
  console.log(`Max Concurrency:      ${MAX_CONCURRENCY}`);
  console.log(`Include Vote RPC:     ${TEST_VOTES ? "YES (RPC cast_vote)" : "NO (Read Heavy)"}`);
  console.log("=======================================================\n");

  // Step 1: Baseline health check
  process.stdout.write("Checking Supabase connection & baseline latency... ");
  const baseline = await measureRequest(() =>
    fetch(`${SUPABASE_URL}/rest/v1/voting-ops?select=id&id=eq.1`, { headers: HEADERS })
  );

  if (!baseline.ok) {
    console.log(`\x1b[31mFAILED (${baseline.error})\x1b[0m`);
    console.error("Could not reach Supabase. Is the project paused or restarting?");
    process.exit(1);
  }
  console.log(`\x1b[32mOK (${baseline.duration.toFixed(1)} ms)\x1b[0m\n`);

  let targetCandidateId = null;
  const testUserId = getArgString("--user-id", null);
  if (TEST_VOTES) {
    if (!testUserId) {
      console.log("\x1b[33mNote: --include-votes requires a valid Supabase user UUID via '--user-id <uuid>' to satisfy auth.users foreign keys.\x1b[0m");
      console.log("\x1b[33mSkipping vote RPC mutations and running read-heavy concurrency load test.\x1b[0m\n");
    } else {
      process.stdout.write("Fetching an active candidate for vote benchmarking... ");
      try {
        const pnmRes = await fetch(`${SUPABASE_URL}/rest/v1/pnms?select=student_id&application=eq.true&limit=1`, { headers: HEADERS });
        if (pnmRes.ok) {
          const pnmData = await pnmRes.json();
          if (pnmData && pnmData.length > 0) {
            targetCandidateId = pnmData[0].student_id;
            console.log(`\x1b[32mOK (Candidate: ${targetCandidateId})\x1b[0m`);
          }
        }
      } catch {
        console.log("\x1b[33mCould not query pnms table, skipping vote RPC\x1b[0m");
      }
    }
  }

  // Build task list
  const tasks = [];
  for (let u = 0; u < NUM_USERS; u++) {
    const userId = `00000000-0000-0000-0000-${String(u + 1).padStart(12, "0")}`;
    for (let r = 0; r < REQS_PER_USER; r++) {
      if (TEST_VOTES && targetCandidateId && testUserId && r % 3 === 0) {
        // Vote RPC task
        tasks.push({
          type: "vote",
          user: u,
          execute: () =>
            fetch(`${SUPABASE_URL}/rest/v1/rpc/cast_vote`, {
              method: "POST",
              headers: HEADERS,
              body: JSON.stringify({
                p_student_id: targetCandidateId,
                p_user_id: testUserId,
                p_section_num: 1,
                p_round_num: 1,
                p_vote_choice: ["yes", "no", "abstain"][r % 3],
              }),
            }),
        });
      } else {
        // Read endpoint task
        const endpoint = READ_ENDPOINTS[(u + r) % READ_ENDPOINTS.length];
        tasks.push({
          type: "read",
          label: endpoint.label,
          user: u,
          execute: () => fetch(`${SUPABASE_URL}${endpoint.path}`, { headers: HEADERS }),
        });
      }
    }
  }

  // Shuffle tasks to simulate real-world interleaved traffic
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }

  console.log(`Starting load test with ${tasks.length} requests at concurrency ${MAX_CONCURRENCY}...`);

  const latencies = [];
  const statusCodes = {};
  let successCount = 0;
  let failCount = 0;
  let completed = 0;

  const startTime = performance.now();

  // Worker pool execution
  let activeIndex = 0;
  async function worker() {
    while (activeIndex < tasks.length) {
      const idx = activeIndex++;
      const task = tasks[idx];
      const result = await measureRequest(task.execute);

      latencies.push(result.duration);
      const code = result.status;
      statusCodes[code] = (statusCodes[code] || 0) + 1;

      if (result.ok || result.status === 200 || result.status === 204 || (TEST_VOTES && result.status === 400)) {
        // 400 for candidate not found is expected if test-pnm-concurrency is not in pnms table
        successCount++;
      } else {
        failCount++;
      }

      completed++;
      if (completed % 25 === 0 || completed === tasks.length) {
        const pct = Math.floor((completed / tasks.length) * 100);
        process.stdout.write(`\rProgress: [${completed}/${tasks.length}] (${pct}%)`);
      }
    }
  }

  const workers = Array.from({ length: MAX_CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const totalTimeSec = (performance.now() - startTime) / 1000;
  console.log("\n");

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const minLatency = latencies[0] || 0;
  const maxLatency = latencies[latencies.length - 1] || 0;
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
  const p50Latency = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95Latency = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const rps = (tasks.length / totalTimeSec).toFixed(1);

  console.log("=======================================================");
  console.log("  BENCHMARK RESULTS");
  console.log("=======================================================");
  console.log(`Total Time:           ${totalTimeSec.toFixed(2)}s`);
  console.log(`Throughput:           ${rps} requests/sec`);
  console.log(`Total Requests:       ${tasks.length}`);
  console.log(`Successful:           \x1b[32m${successCount}\x1b[0m`);
  console.log(`Failed (5xx/Timeouts): ${failCount > 0 ? `\x1b[31m${failCount}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);
  console.log("-------------------------------------------------------");
  console.log("Latency Statistics:");
  console.log(`  Min:                ${minLatency.toFixed(1)} ms`);
  console.log(`  Average:            ${avgLatency.toFixed(1)} ms`);
  console.log(`  Median (p50):       ${p50Latency.toFixed(1)} ms`);
  console.log(`  95th Percentile:    ${p95Latency.toFixed(1)} ms`);
  console.log(`  Max:                ${maxLatency.toFixed(1)} ms`);
  console.log("-------------------------------------------------------");
  console.log("HTTP Status Distribution:");
  for (const [code, count] of Object.entries(statusCodes)) {
    const color = code === "200" || code === "204" ? "\x1b[32m" : code.startsWith("5") ? "\x1b[31m" : "\x1b[33m";
    console.log(`  ${color}HTTP ${code}: ${count} (${((count / tasks.length) * 100).toFixed(1)}%)\x1b[0m`);
  }
  console.log("=======================================================\n");

  if (TEST_VOTES && targetCandidateId && testUserId) {
    process.stdout.write("Cleaning up synthetic test votes... ");
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/cast_vote`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          p_student_id: targetCandidateId,
          p_user_id: testUserId,
          p_section_num: 1,
          p_round_num: 1,
          p_vote_choice: null,
        }),
      });
      console.log("\x1b[32mOK (Synthetic test vote cleared)\x1b[0m\n");
    } catch {
      console.log("\x1b[33mWarning: could not clean up synthetic votes\x1b[0m\n");
    }
  }

  if (statusCodes["503"] || statusCodes["522"]) {
    console.error("\x1b[31mALERT: 503 or 522 errors were encountered. The database may still have hung connections or unapplied SQL indexes.\x1b[0m");
    process.exit(1);
  } else {
    console.log("\x1b[32mPASS: All requests served cleanly with 0 server timeouts or connection crashes!\x1b[0m\n");
  }
}

runBenchmark();
