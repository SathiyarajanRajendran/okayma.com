// Outbound email via Resend. When RESEND_API_KEY is unset — local development,
// or before the key is added in production — the message is logged instead of
// sent, so the whole flow can be exercised without a provider.

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function send(env, { to, subject, heading, body, actionLabel, actionUrl, footer }) {
  const safeUrl = escapeHtml(actionUrl);
  const html = `<!doctype html>
<html><body style="margin:0;background:#f4f6f8;font-family:Segoe UI,system-ui,-apple-system,sans-serif;color:#16202b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:36px">
        <tr><td>
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b7a8c">Okayma.com</p>
          <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#3d4c5c">${escapeHtml(body)}</p>
          <a href="${safeUrl}" style="display:inline-block;background:#101923;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:9px;font-size:15px">${escapeHtml(actionLabel)}</a>
          <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#6b7a8c">${escapeHtml(footer)}</p>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8b99a8;word-break:break-all">${safeUrl}</p>
          <hr style="border:none;border-top:1px solid #e4e9ee;margin:28px 0 0">
          <p style="margin:16px 0 0;font-size:12px;color:#8b99a8">Shreevaari Consulting Ltd, trading as Okayma.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `${heading}\n\n${body}\n\n${actionLabel}: ${actionUrl}\n\n${footer}\n\nShreevaari Consulting Ltd, trading as Okayma.com`;

  if (!env.RESEND_API_KEY) {
    console.log(`[mail:not-sent] RESEND_API_KEY missing. to=${to} subject="${subject}"`);
    console.log(`[mail:link] ${actionUrl}`);
    return { sent: false, reason: "no-api-key", link: actionUrl };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM || "Okayma.com <no-reply@okayma.com>",
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.log(`[mail:error] ${response.status} ${detail}`);
    return { sent: false, reason: "provider-error" };
  }

  // Log the provider's id, not the recipient: enough to correlate a delivery
  // in the Resend dashboard without putting a member's address in the logs.
  let id = null;
  try {
    id = (await response.json()).id || null;
  } catch {
    /* a success without a parsable body is still a success */
  }
  console.log(`[mail:sent] subject="${subject}" id=${id}`);
  return { sent: true, id };
}

export function sendVerificationEmail(env, { to, firstName, link }) {
  return send(env, {
    to,
    subject: "Confirm your email to post an idea on Okayma",
    heading: `Welcome, ${firstName}`,
    body: "Confirm this email address and your Okayma account is ready. You can then post an idea for review, and it appears on the ideas board once approved.",
    actionLabel: "Confirm my email",
    actionUrl: link,
    footer: "This link works once and expires in 24 hours. If you did not sign up, ignore this email and nothing happens.",
  });
}

export function sendSignInEmail(env, { to, firstName, link }) {
  return send(env, {
    to,
    subject: "Your Okayma sign-in link",
    heading: `Sign in, ${firstName}`,
    body: "Use the link below to sign in to Okayma. There is no password to remember.",
    actionLabel: "Sign me in",
    actionUrl: link,
    footer: "This link works once and expires in 24 hours. If you did not ask to sign in, ignore this email.",
  });
}

export function sendDecisionEmail(env, { to, firstName, ideaTitle, approved, siteUrl }) {
  return send(env, {
    to,
    subject: approved ? "Your Okayma idea is now live" : "An update on your Okayma idea",
    heading: approved ? "Your idea has been published" : "Your idea was not published",
    body: approved
      ? `${firstName}, "${ideaTitle}" has been approved and is now on the Okayma ideas board.`
      : `${firstName}, "${ideaTitle}" was reviewed but has not been published. You are welcome to post another idea.`,
    actionLabel: "Open the ideas board",
    actionUrl: `${siteUrl}/ideas`,
    footer: "Thank you for sharing your thinking with Okayma.",
  });
}
