#!/usr/bin/env node
/**
 * Generates the value for the ADMIN_PASSWORD_HASH secret.
 *
 *   node scripts/admin-password.mjs "your chosen password"
 *
 * The password itself is never stored anywhere — only the salted PBKDF2 hash
 * this prints, which is what the login endpoint compares against.
 */

import { webcrypto as crypto } from "node:crypto";

const PBKDF2_ITERATIONS = 100000; // must match lib/crypto.js (Workers caps this at 100000)

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/admin-password.mjs "your chosen password"');
  process.exit(1);
}

if (password.length < 12) {
  console.error("Use at least 12 characters. This is the only key to the admin console.");
  process.exit(1);
}

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

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const value = `${hex(salt)}$${hex(new Uint8Array(bits))}`;

console.log("\nADMIN_PASSWORD_HASH\n");
console.log(value);
console.log("\nSet it on the Pages project:\n");
console.log("  npx wrangler@3 pages secret put ADMIN_PASSWORD_HASH --project-name=okayma\n");
console.log("...then paste the value above when prompted.\n");
console.log("For local testing, put the same line in .dev.vars:\n");
console.log(`  ADMIN_PASSWORD_HASH=${value}\n`);
