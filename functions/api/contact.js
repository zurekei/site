// Contact form endpoint. Lives here rather than in a standalone Worker so that
// the browser calls a same-origin path (/api/contact) — the previous setup put
// the Worker's public hostname into contact.js, which shipped that hostname to
// every visitor. Same-origin also means no CORS preflight to maintain.
//
// Secrets are set on the Pages project (Settings → Variables), never in the repo:
//   TURNSTILE_SECRET_KEY, RESEND_API_KEY, RECIPIENT_EMAIL, FROM_EMAIL

const LIMITS = { name: 200, email: 320, affiliation: 200, message: 10000 };

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { name, email, affiliation, message, turnstileToken } = body;

    if (!name || !email || !message || !turnstileToken) {
      return json({ success: false, error: 'Missing required fields' }, 400);
    }

    // A public endpoint: cap field lengths so a single request cannot push an
    // arbitrarily large body through to the mail API.
    if (
      name.length > LIMITS.name ||
      email.length > LIMITS.email ||
      (affiliation || '').length > LIMITS.affiliation ||
      message.length > LIMITS.message
    ) {
      return json({ success: false, error: 'Field too long' }, 400);
    }

    const turnstile = await verifyTurnstile(turnstileToken, env);
    if (!turnstile.success) {
      // Log the error-codes rather than only the outcome: a wrong secret key and a
      // genuine bot both surface as the same 400 to the caller, and without this the
      // two are indistinguishable from the outside.
      console.error('Turnstile rejected:', JSON.stringify(turnstile['error-codes']));
      return json({ success: false, error: 'Turnstile verification failed' }, 400);
    }

    const sent = await sendEmail({ name, email, affiliation, message }, env);
    if (!sent) {
      return json({ success: false, error: 'Failed to send email' }, 500);
    }

    return json({ success: true }, 200);
  } catch (error) {
    console.error('Error:', error);
    return json({ success: false, error: 'Server error' }, 500);
  }
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function verifyTurnstile(token, env) {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
  });
  return response.json();
}

async function sendEmail(data, env) {
  const { name, email, affiliation, message } = data;

  // Dashboard paste is a common source of a stray newline or space, which turns a
  // correct key into a 401 that looks identical to a wrong key.
  const apiKey = (env.RESEND_API_KEY || '').trim();
  const fromEmail = (env.FROM_EMAIL || '').trim();
  const toEmail = (env.RECIPIENT_EMAIL || '').trim();

  // Fail loudly at the source rather than letting Resend reject an empty Bearer token
  // or a padded address, both of which surface as an opaque 401/422.
  if (!apiKey || !fromEmail || !toEmail) {
    console.error(
      'missing config:',
      JSON.stringify({ apiKey: !!apiKey, fromEmail, toEmail })
    );
    return false;
  }

  const emailBody = `
お名前: ${name}
メールアドレス: ${email}
${affiliation ? `所属・肩書: ${affiliation}\n` : ''}

【お問い合わせ内容】
${message}

---
※このメールはズレ計のお問い合わせフォームから自動送信されています
`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `ズレ計 お問い合わせ <${fromEmail}>`,
        to: [toEmail],
        subject: `【ズレ計】お問い合わせ: ${name}さんから`,
        text: emailBody,
        html: `<pre>${escapeHtml(emailBody)}</pre>`,
        // so that hitting Reply in the inbox answers the person who wrote in,
        // not the form's own sender address.
        reply_to: email,
      }),
    });

    if (!response.ok) {
      console.error('Resend API error:', response.status, await response.text());
      // Shape only, never the value: enough to tell "empty" / "wrong kind of string" /
      // "stray whitespace" apart, none of which the 401 body distinguishes.
      const raw = env.RESEND_API_KEY || '';
      console.error(
        'key shape:',
        JSON.stringify({
          len: raw.length,
          prefix: raw.slice(0, 3),
          trimmedLen: apiKey.length,
          from: env.FROM_EMAIL,
          to: env.RECIPIENT_EMAIL,
        })
      );
      return false;
    }
    console.log('Resend accepted');
    return true;
  } catch (error) {
    console.error('Send email error:', error);
    return false;
  }
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
