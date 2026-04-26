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

export function passwordResetEmail(params: {
  fullName: string;
  resetUrl: string;
}): EmailPayload {
  return {
    to: '',
    subject: 'Reset your KitchenLedger password',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Password reset request</h2>
        <p>Hi ${params.fullName},</p>
        <p>We received a request to reset your password. Click the button below to choose a new one.</p>
        <a href="${params.resetUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;margin-top:16px">
          Reset Password
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:16px">
          This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.
        </p>
        <p style="color:#6b7280;font-size:13px;margin-top:32px">
          KitchenLedger · The all-in-one platform for independent restaurants
        </p>
      </div>
    `,
  };
}

export function paymentOverdueEmail(params: {
  vendorName: string;
  amount: string;
  currency: string;
  dueDate: string;
  appUrl: string;
}): EmailPayload {
  return {
    to: '',
    subject: `Payment overdue — ${params.vendorName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#dc2626">Payment Overdue</h2>
        <p>A payment to <strong>${params.vendorName}</strong> is past due.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#6b7280">Vendor</td><td style="padding:8px 0;font-weight:600">${params.vendorName}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Amount</td><td style="padding:8px 0;font-weight:600;color:#dc2626">${params.currency}${params.amount}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Due Date</td><td style="padding:8px 0">${params.dueDate}</td></tr>
        </table>
        <a href="${params.appUrl}/finance/accounts-payable"
           style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;margin-top:8px">
          View & Pay Now
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:32px">
          KitchenLedger · The all-in-one platform for independent restaurants
        </p>
      </div>
    `,
  };
}

export function reportReadyEmail(params: {
  reportName: string;
  downloadUrl: string;
  expiresAt: string;
}): EmailPayload {
  return {
    to: '',
    subject: `Your ${params.reportName} is ready`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Your report is ready</h2>
        <p><strong>${params.reportName}</strong> has been generated and is ready to download.</p>
        <a href="${params.downloadUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;margin-top:16px">
          Download Report
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:12px">
          This download link expires on ${params.expiresAt}.
        </p>
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
  /** Fully-formed accept URL — token embedded by auth-service, never passed through MQ */
  inviteUrl: string;
  role: string;
}): EmailPayload {
  const acceptUrl = params.inviteUrl;
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
