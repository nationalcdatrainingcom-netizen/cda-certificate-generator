// email.js — Magic link sender using SendGrid REST API directly
const APP_URL = process.env.APP_URL  || 'https://cda-certificate-generator.onrender.com';
const FROM    = process.env.EMAIL_FROM || 'mary@nationalcdatraining.com';
const API_KEY = process.env.SENDGRID_API_KEY;

async function sendMagicLink(toEmail, token, studentName) {
  if (!API_KEY) throw new Error('SENDGRID_API_KEY is not set.');

  const link      = `${APP_URL}/portal?token=${token}`;
  const firstName = studentName ? studentName.split(' ')[0] : 'there';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#1a2744;padding:32px 40px;text-align:center;">
            <div style="font-family:'Georgia',serif;font-size:22px;color:#c9a84c;font-weight:bold;">
              National CDA Training
            </div>
            <div style="color:#a8b8d4;font-size:13px;margin-top:6px;">Student Certificate Portal</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1a2744;">Hi ${firstName},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
              Here is your secure link to access your CDA training certificates and transcript.
              Click the button below to view and download your documents.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 32px;">
                  <a href="${link}"
                     style="display:inline-block;background:#c9a84c;color:#1a2744;text-decoration:none;
                            font-weight:bold;font-size:16px;padding:14px 36px;border-radius:8px;">
                    Access My Certificates &rarr;
                  </a>
                </td>
              </tr>
            </table>
            <div style="background:#f8f7f3;border:1px solid #e5e0d5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
                <strong>This link expires in 24 hours</strong> and can only be used once.
                If you need a new link, return to the portal and request another.
              </p>
            </div>
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
              If you did not request this link, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f7f3;border-top:1px solid #e5e0d5;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              National CDA Training &nbsp;&middot;&nbsp; 4775 Erie Drive, Buchanan, MI 49107<br>
              866-726-3056 &nbsp;&middot;&nbsp; Mary@NationalCDATraining.com
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: FROM, name: 'National CDA Training' },
    reply_to: { email: FROM },
    subject: 'Your CDA Training Certificates — Access Link',
    content: [{ type: 'text/html', value: html }],
  };

  console.log(`Sending to: ${toEmail}, from: ${FROM}`);
  console.log('Payload from field:', JSON.stringify(payload.from));

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('SendGrid status:', res.status);
    console.error('SendGrid errors:', JSON.stringify(body.errors, null, 2));
    throw new Error(`SendGrid ${res.status}: ${JSON.stringify(body.errors)}`);
  }

  console.log(`Magic link sent successfully to ${toEmail}`);
}

module.exports = { sendMagicLink };
