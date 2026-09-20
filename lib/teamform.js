// Shared by the team create and update routes.
//
// Lives here rather than being imported from one route module into another:
// a Pages Function file is an HTTP entry point, and importing across them
// couples two routes through the bundler for no reason.

// Reads a multipart submission into the same shape the JSON validators expect,
// plus the raw photo bytes. Multipart rather than base64-in-JSON: it avoids
// inflating every upload by a third, and the browser builds it for free.
export async function readTeamForm(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.includes("multipart/form-data")) return null;

  let form;
  try {
    form = await request.formData();
  } catch {
    return null;
  }

  const field = (name) => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };

  const body = {
    name: field("name"),
    role: field("role"),
    bio: field("bio"),
    linkedinUrl: field("linkedinUrl"),
    status: field("status"),
    sortOrder: field("sortOrder"),
  };

  const file = form.get("photo");
  const hasFile = file && typeof file !== "string" && file.size > 0;
  const photoBytes = hasFile ? new Uint8Array(await file.arrayBuffer()) : null;

  // A checkbox the console sends when the admin wants the existing portrait
  // removed without supplying a replacement.
  const removePhoto = field("removePhoto") === "true";

  return { body, photoBytes, removePhoto };
}
