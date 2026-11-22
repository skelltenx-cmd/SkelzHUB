// Kirim email SkelzHub — mendukung 2 penyedia:
// 1) RESEND_API_KEY  (paling gampang: resend.com, gratis 100 email/hari)
// 2) SMTP_HOST/PORT/USER/PASS/FROM (mis. Gmail dengan app password)
// Kalau keduanya belum di-set -> mode demo: kode ditampilkan di layar
// (supaya fitur verifikasi tetap bisa dipakai tanpa setup email).

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "SkelzHub <onboarding@resend.dev>";

export function emailConfigured(): boolean {
  return Boolean(RESEND_KEY || (SMTP_HOST && SMTP_USER && SMTP_PASS));
}

export type CodePurpose = "login" | "reset";

function emailHtml(purpose: CodePurpose, code: string, minutes: number): string {
  const isLogin = purpose === "login";
  const title = isLogin ? "Kode verifikasi masuk" : "Kode reset password";
  const desc = isLogin
    ? "Masukkan kode 6 digit di bawah ini untuk menyelesaikan proses masuk ke akunmu."
    : "Masukkan kode 6 digit di bawah ini untuk mengganti password akunmu.";
  const descEn = isLogin
    ? "Enter the 6-digit code below to finish signing in to your account."
    : "Enter the 6-digit code below to set a new password for your account.";
  const subject = isLogin ? "Kode masuk SkelzHub" : "Kode reset password SkelzHub";
  const digits = code
    .split("")
    .map(
      (d) =>
        `<td align="center" style="width:44px;height:52px;background:#ffffff;border:1px solid #e4e4e7;border-bottom:3px solid #f43f5e;border-radius:10px;font-size:24px;line-height:52px;font-weight:bold;color:#18181b;font-family:'Courier New',Courier,monospace;">${d}</td><td style="width:6px;font-size:0;">&nbsp;</td>`
    )
    .join("");
  return `<!doctype html><html lang="id"><body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;">${subject} — ${code} &#8199;&#8199;&#8199;&#8199;&#8199;&#8199;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(24,24,27,0.08);">

      <!-- Header banner -->
      <tr>
        <td style="background:#f43f5e;background-image:linear-gradient(135deg,#f43f5e 0%,#fb923c 100%);padding:28px 32px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
            <tr>
              <td style="width:44px;height:44px;background:rgba(255,255,255,0.22);border-radius:14px;text-align:center;font-size:23px;line-height:44px;font-weight:bold;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">S</td>
              <td style="padding-left:10px;font-size:22px;font-weight:bold;color:#ffffff;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.5px;">SkelzHub</td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Isi -->
      <tr>
        <td style="padding:32px 32px 8px;font-family:Arial,Helvetica,sans-serif;">
          <h1 style="margin:0 0 10px;font-size:19px;line-height:1.35;color:#18181b;">${title}</h1>
          <p style="margin:0 0 6px;font-size:13.5px;line-height:1.6;color:#52525b;">${desc}</p>
          <p style="margin:0;font-size:13.5px;line-height:1.6;color:#52525b;">
            Berlaku <span style="background:#fdf2f4;color:#e11d48;border-radius:6px;padding:2px 8px;font-weight:bold;">${minutes} menit</span>.
          </p>
        </td>
      </tr>

      <!-- Kode -->
      <tr>
        <td align="center" style="padding:22px 24px 10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
            <tr>${digits}</tr>
          </table>
        </td>
      </tr>

      <!-- Catatan -->
      <tr>
        <td style="padding:8px 32px 26px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 10px;font-size:12.5px;line-height:1.6;color:#71717a;">
            Kalau bukan kamu yang meminta kode ini, abaikan email ini &mdash; akunmu tetap aman dan tidak akan bisa diakses tanpa kode di atas.
          </p>
        </td>
      </tr>

      <!-- Divider + footer -->
      <tr><td style="padding:0 32px;"><div style="height:1px;background:#e4e4e7;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
      <tr>
        <td style="padding:18px 32px 24px;font-family:Arial,Helvetica,sans-serif;text-align:center;">
          <p style="margin:0 0 4px;font-size:11px;line-height:1.5;color:#a1a1aa;">${subject} &middot; ${descEn} It expires in ${minutes} minutes.</p>
          <p style="margin:0;font-size:11px;line-height:1.5;color:#a1a1aa;">Email otomatis dari SkelzHub &mdash; tidak perlu dibalas.</p>
        </td>
      </tr>
    </table>

    <p style="margin:14px 0 0;font-size:11px;color:#a1a1aa;font-family:Arial,Helvetica,sans-serif;">&copy; ${new Date().getFullYear()} SkelzHub &middot; Bagikan momen terbaikmu</p>
  </td></tr>
</table>
</body></html>`;
}

/** Kirim kode verifikasi (login 2FA / reset password). true = terkirim. */
export async function sendCodeEmail(
  to: string,
  code: string,
  minutes: number,
  purpose: CodePurpose
): Promise<boolean> {
  const isLogin = purpose === "login";
  const subject = isLogin ? `Kode masuk SkelzHub: ${code}` : `Kode reset password SkelzHub: ${code}`;
  const html = emailHtml(purpose, code, minutes);
  const text = isLogin
    ? `Kode verifikasi masuk SkelzHub kamu: ${code} (berlaku ${minutes} menit).`
    : `Kode reset password SkelzHub kamu: ${code} (berlaku ${minutes} menit).`;

  try {
    if (RESEND_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: SMTP_FROM || "SkelzHub <onboarding@resend.dev>",
          to: [to],
          subject,
          html,
          text,
        }),
      });
      if (!res.ok) {
        console.error("[skelzhub] Resend error:", await res.text().catch(() => ""));
        return false;
      }
      return true;
    }

    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      const nodemailer = await import("nodemailer").then((m) => m.default ?? m);
      const transport = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
      await transport.sendMail({ from: SMTP_FROM, to, subject, html, text });
      return true;
    }
  } catch (err) {
    console.error("[skelzhub] Gagal mengirim email:", err instanceof Error ? err.message : err);
    return false;
  }

  return false; // belum dikonfigurasi -> mode demo (kode tampil di layar)
}

export async function sendResetCodeEmail(to: string, code: string, minutes: number): Promise<boolean> {
  return sendCodeEmail(to, code, minutes, "reset");
}

export async function sendLoginCodeEmail(to: string, code: string, minutes: number): Promise<boolean> {
  return sendCodeEmail(to, code, minutes, "login");
}
