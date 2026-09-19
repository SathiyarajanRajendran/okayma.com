import { json } from "../../lib/http.js";
import { STAGES } from "../../lib/stages.js";

// The stage vocabulary, served to both the public board and the admin console
// so neither has to hard-code labels that would then drift from lib/stages.js.
export async function onRequestGet() {
  return json(
    { stages: STAGES },
    200,
    // Safe to cache: this changes only when the code does, and a deploy busts
    // it along with everything else.
    { "Cache-Control": "public, max-age=300" }
  );
}
