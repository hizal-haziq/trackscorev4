/**
 * Transactional Email Helper via Resend REST API
 * Sends professional HTML emails with graceful sandbox diagnostics and fallback handling.
 */

/**
 * Send vendor portal onboarding invitation email
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.companyName - Client company name
 * @param {string} options.setupUrl - Full URL to set up vendor portal password
 * @param {string} [options.invitedBy] - Name of manager issuing invite
 * @returns {Promise<{ sent: boolean, id?: string, error?: string, sandboxRestricted?: boolean }>}
 */
export async function sendVendorInviteEmail({ to, companyName, setupUrl, invitedBy = 'TrackScore Operations' }) {
  const cleanTo = String(to || '').trim();
  if (!cleanTo) {
    return { sent: false, error: 'Recipient email is missing.' };
  }

  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    console.info('[EMAIL-NOTICE] RESEND_API_KEY is not configured in environment. Automated email delivery skipped.');
    return {
      sent: false,
      error: 'RESEND_API_KEY environment variable is not configured.'
    };
  }

  const fromAddress = (process.env.EMAIL_FROM || 'TrackScore Telematics <onboarding@resend.dev>').trim();
  const safeCompany = companyName || 'Valued Client';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your TrackScore Vendor Portal Access</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; color: #0F172A; margin: 0; padding: 24px; }
    .email-container { max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #0F172A; padding: 28px 24px; text-align: center; border-bottom: 3px solid #F58220; }
    .header h1 { margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0 0; color: #94A3B8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .content { padding: 28px 24px; font-size: 14px; line-height: 1.6; color: #334155; }
    .button-container { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #1E3A8A; color: #FFFFFF !important; text-decoration: none; padding: 12px 28px; font-size: 14px; font-weight: 600; border-radius: 6px; }
    .fallback-box { background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 6px; padding: 12px; margin-top: 20px; font-size: 12px; word-break: break-all; font-family: monospace; color: #475569; }
    .footer { padding: 20px 24px; background: #F8FAFC; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B; text-align: center; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <p>MIROS Telematics Assessment</p>
      <h1>TrackScore Vendor Portal</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${safeCompany}</strong>,</p>
      <p>An authorized TrackScore evaluation workspace has been initialized for your organization by <strong>${invitedBy}</strong>.</p>
      <p>Through the Vendor Portal, you can track real-time assessment milestones, review digital scorecards, and download official MIROS evaluation certificates.</p>
      <p>Please click the button below to set your account password and activate your self-service portal:</p>
      
      <div class="button-container">
        <a href="${setupUrl}" class="btn" target="_blank" rel="noopener noreferrer">Set Up Your Account &rarr;</a>
      </div>

      <p style="font-size: 12.5px; color: #64748B;">This setup link is unique to your organization and is valid for <strong>7 days</strong>.</p>

      <div class="fallback-box">
        <strong>Direct Setup Link:</strong><br>
        ${setupUrl}
      </div>
    </div>
    <div class="footer">
      TrackScore Telematics Assessment System &bull; Malaysian Institute of Road Safety Research (MIROS)<br>
      This is an automated notification. If you did not request assessment registration, please contact operations.
    </div>
  </div>
</body>
</html>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [cleanTo],
        subject: `Your TrackScore Vendor Portal Access - ${safeCompany}`,
        html: htmlContent
      })
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      console.log(`[RESEND-SUCCESS] Sent vendor invitation to ${cleanTo} (Message ID: ${data.id || data.data?.id})`);
      return { sent: true, id: data.id || data.data?.id };
    }

    // Handle known Resend testing mode restrictions (403 / 422 validation_error)
    const errMessage = data.message || data.error?.message || 'Resend API returned an error.';
    const isSandboxRestriction = response.status === 403 || response.status === 422 || data.name === 'validation_error';

    if (isSandboxRestriction) {
      console.info(`[RESEND-SANDBOX-NOTICE] ${cleanTo}: ${errMessage}`);
      return {
        sent: false,
        sandboxRestricted: true,
        error: errMessage
      };
    }

    console.warn(`[RESEND-NOTICE] HTTP ${response.status}: ${errMessage}`);
    return { sent: false, error: errMessage };
  } catch (err) {
    console.warn('[EMAIL-DISPATCH-NOTICE]', err.message || err);
    return { sent: false, error: err.message || 'Unexpected failure while dispatching email.' };
  }
}

export default { sendVendorInviteEmail };
