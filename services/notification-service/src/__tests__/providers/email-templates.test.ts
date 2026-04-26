import { describe, it, expect } from 'vitest';
import {
  paymentOverdueEmail,
  reportReadyEmail,
  welcomeEmail,
  invitationEmail,
  passwordResetEmail,
} from '../../providers/resend-email.provider';

describe('email templates', () => {

  // ── paymentOverdueEmail ──────────────────────────────────────────

  describe('paymentOverdueEmail', () => {
    it('sets correct subject with vendor name', () => {
      const email = paymentOverdueEmail({
        vendorName: 'Metro Supplies',
        amount: '4500.00',
        currency: '₹',
        dueDate: '2026-04-20',
        appUrl: 'https://app.kitchenledger.com',
      });
      expect(email.subject).toBe('Payment overdue — Metro Supplies');
    });

    it('includes vendor name, amount, and due date in body', () => {
      const email = paymentOverdueEmail({
        vendorName: 'Metro Supplies',
        amount: '4500.00',
        currency: '₹',
        dueDate: '2026-04-20',
        appUrl: 'https://app.kitchenledger.com',
      });
      expect(email.html).toContain('Metro Supplies');
      expect(email.html).toContain('4500.00');
      expect(email.html).toContain('2026-04-20');
    });

    it('includes AP link in CTA', () => {
      const email = paymentOverdueEmail({
        vendorName: 'Vendor A',
        amount: '100',
        currency: '₹',
        dueDate: '2026-04-01',
        appUrl: 'https://app.kitchenledger.com',
      });
      expect(email.html).toContain('finance/accounts-payable');
    });
  });

  // ── reportReadyEmail ─────────────────────────────────────────────

  describe('reportReadyEmail', () => {
    it('sets correct subject with report name', () => {
      const email = reportReadyEmail({
        reportName: 'Monthly P&L Report',
        downloadUrl: 'https://storage.example.com/report.pdf',
        expiresAt: '2026-05-01',
      });
      expect(email.subject).toBe('Your Monthly P&L Report is ready');
    });

    it('includes download URL in body', () => {
      const email = reportReadyEmail({
        reportName: 'Waste Report',
        downloadUrl: 'https://storage.example.com/waste.pdf',
        expiresAt: '2026-05-01',
      });
      expect(email.html).toContain('https://storage.example.com/waste.pdf');
    });

    it('includes expiry date in body', () => {
      const email = reportReadyEmail({
        reportName: 'P&L',
        downloadUrl: 'https://example.com/r.pdf',
        expiresAt: '2026-05-15',
      });
      expect(email.html).toContain('2026-05-15');
    });
  });

  // ── Existing templates still work ───────────────────────────────

  it('welcomeEmail has correct subject', () => {
    const email = welcomeEmail({ fullName: 'Ali', restaurantName: 'Spice Garden', appUrl: 'https://app.kl.com' });
    expect(email.subject).toBe('Welcome to KitchenLedger!');
    expect(email.html).toContain('Ali');
    expect(email.html).toContain('Spice Garden');
  });

  it('passwordResetEmail contains reset link', () => {
    const email = passwordResetEmail({ fullName: 'Ali', resetUrl: 'https://app.kl.com/reset?token=abc' });
    expect(email.html).toContain('https://app.kl.com/reset?token=abc');
  });

  it('invitationEmail contains accept URL', () => {
    const email = invitationEmail({
      fullName: 'Priya',
      restaurantName: 'Spice Garden',
      inviteUrl: 'https://app.kl.com/invite/accept?token=xyz',
      role: 'manager',
    });
    expect(email.html).toContain('https://app.kl.com/invite/accept?token=xyz');
    expect(email.subject).toContain('Spice Garden');
  });
});
