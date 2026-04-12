import { Resend } from 'resend';
import { config } from '../config';

const resend = new Resend(config.RESEND_API_KEY);

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  try {
    await resend.emails.send({
      from: config.RESEND_FROM_EMAIL,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
  } catch (err) {
    console.error('Failed to send email to', payload.to, ':', err);
    throw err;
  }
}

// ── Email templates ──────────────────────────────────────────────

export function welcomeEmail(params: {
  fullName: string;
  restaurantName: string;
  appUrl: string;
}): EmailPayload {
  return {
    to: '', // set by caller
    subject: 'Welcome to KitchenLedger!',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Welcome, ${params.fullName}!</h2>
        <p>Your KitchenLedger account for <strong>${params.restaurantName}</strong> is ready.</p>
        <p>Start by setting up your inventory, adding staff, and tracking your daily sales.</p>
        <a href="${params.appUrl}/onboarding"
           style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;margin-top:16px">
          Get Started
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:32px">
          KitchenLedger · The all-in-one platform for independent restaurants
        </p>
      </div>
    `,
  };
}

export function invitationEmail(params: {
  fullName: string;
  restaurantName: string;
  inviteToken: string;
  role: string;
  appUrl: string;
}): EmailPayload {
  const acceptUrl = `${params.appUrl}/accept-invite?token=${params.inviteToken}`;
  return {
    to: '', // set by caller
    subject: `You've been invited to join ${params.restaurantName} on KitchenLedger`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>You have a new invitation</h2>
        <p>Hi ${params.fullName},</p>
        <p>You've been invited to join <strong>${params.restaurantName}</strong>
           as <strong>${params.role.replace('_', ' ')}</strong>.</p>
        <a href="${acceptUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;margin-top:16px">
          Accept Invitation
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:8px">
          This link expires in 72 hours.
        </p>
        <p style="color:#6b7280;font-size:13px;margin-top:32px">
          If you didn't expect this, you can safely ignore this email.
        </p>
      </div>
    `,
  };
}
