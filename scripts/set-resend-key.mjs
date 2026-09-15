#!/usr/bin/env node
/**
 * Uploads the Resend API key as the RESEND_API_KEY Pages secret:
 *
 *   npm run set-resend-key -- "re_xxxxxxxxxxxxxxxxxxxxxxxx"
 *
 * Same reasoning as set-admin-password.mjs: `wrangler pages secret put` prompts
 * with a masked field, so a truncated or empty paste stores silently and only
 * shows up later as mail that never arrives. Piping the value removes the
 * prompt, and the shape check below catches an obviously wrong paste.
 */

import { spawn } from "node:child_process";

const PROJECT = "okayma";
const SECRET = "RESEND_API_KEY";

const key = process.argv.slice(2).join(" ").trim();

if (!key) {
  console.error('Usage: npm run set-resend-key -- "re_xxxxxxxxxxxxxxxxxxxxxxxx"');
  process.exit(1);
}
if (!key.startsWith("re_")) {
  console.error(`That does not look like a Resend key — they begin with "re_". Got: ${key.slice(0, 3)}...`);
  process.exit(1);
}
if (key.length < 20) {
  console.error(`That key looks truncated (${key.length} characters). Copy the whole value.`);
  process.exit(1);
}

console.log(`Uploading a ${key.length}-character key to Pages project "${PROJECT}"...\n`);

// shell: true is required on Windows — Node 20.12+ refuses to spawn a .cmd
// directly. Every argument here is a fixed literal.
const child = spawn(
  "npx",
  ["wrangler@3", "pages", "secret", "put", SECRET, `--project-name=${PROJECT}`],
  { stdio: ["pipe", "inherit", "inherit"], shell: true }
);

// No trailing newline — `echo` would append one and the key would be rejected
// by Resend as malformed.
child.stdin.write(key);
child.stdin.end();

child.on("close", (code) => {
  if (code !== 0) {
    console.error(`\nwrangler exited with code ${code}. The secret was NOT set.`);
    process.exit(code ?? 1);
  }
  console.log("\nSecret uploaded. Now run:\n");
  console.log("  npm run deploy\n");
  console.log("Then register a real address on https://okayma.com/ideas and check the inbox.");
  console.log("If nothing arrives, watch the Worker log for [mail:error] lines:\n");
  console.log("  npx wrangler@3 pages deployment tail <deployment-id> --project-name=okayma\n");
});
