#!/usr/bin/env node
/**
 * Generates the admin password hash AND uploads it as the Pages secret in one
 * step:
 *
 *   npm run set-admin-password -- "your chosen password"
 *
 * Why this exists: `wrangler pages secret put` prompts with a masked field, so
 * a half-pasted or empty value gives no visible clue that it went wrong. It
 * then stores happily, `secret list` reports "Value Encrypted" either way, and
 * every sign-in fails looking like a wrong password. Piping the value removes
 * the prompt, and the length check below removes the guesswork.
 *
 * The password is never written to disk and never leaves this process except
 * as its PBKDF2 hash.
 */

import { webcrypto as crypto } from "node:crypto";
import { spawn } from "node:child_process";

const PBKDF2_ITERATIONS = 210000; // must match lib/crypto.js
const PROJECT = "okayma";
const SECRET = "ADMIN_PASSWORD_HASH";

const password = process.argv.slice(2).join(" ").trim();

if (!password) {
  console.error('Usage: npm run set-admin-password -- "your chosen password"');
  process.exit(1);
}
if (password.length < 12) {
  console.error("Use at least 12 characters. This is the only key to the admin console.");
  process.exit(1);
}
if (password === "a long password you have not used elsewhere") {
  console.error("That is the placeholder from the instructions, not a password. Choose your own.");
  process.exit(1);
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password),
  "PBKDF2",
  false,
  ["deriveBits"]
);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
  key,
  256
);

const value = `${hex(salt)}$${hex(new Uint8Array(bits))}`;

if (!/^[0-9a-f]{32}\$[0-9a-f]{64}$/.test(value)) {
  console.error("Generated hash failed its own format check — aborting.");
  process.exit(1);
}

console.log(`Generated a ${value.length}-character hash. Uploading to Pages project "${PROJECT}"...\n`);

// shell: true is required on Windows — since Node 20.12 spawning a .cmd
// directly throws EINVAL. Every argument here is a fixed literal, so there is
// no user input reaching the shell.
const child = spawn(
  "npx",
  ["wrangler@3", "pages", "secret", "put", SECRET, `--project-name=${PROJECT}`],
  { stdio: ["pipe", "inherit", "inherit"], shell: true }
);

// No trailing newline: `echo` would append one and the stored hash would not
// match, which fails as a wrong password rather than as a broken secret.
child.stdin.write(value);
child.stdin.end();

child.on("close", (code) => {
  if (code !== 0) {
    console.error(`\nwrangler exited with code ${code}. The secret was NOT set.`);
    process.exit(code ?? 1);
  }
  console.log("\nSecret uploaded. Now run:\n");
  console.log("  npm run deploy\n");
  console.log("Then confirm with your REAL password — 200 means you are in:\n");
  console.log(
    "  curl -s -o /dev/null -w \"%{http_code}\\n\" -X POST https://okayma.com/api/admin/login \\\n" +
      "    -H 'Content-Type: application/json' -H 'Origin: https://okayma.com' \\\n" +
      "    -d '{\"email\":\"sathiya@okayma.com\",\"password\":\"<your password>\"}'\n"
  );
  console.log("A 503 now means the hash is malformed; 401 means wrong password.\n");
});
