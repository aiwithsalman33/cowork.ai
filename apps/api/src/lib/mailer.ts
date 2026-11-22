import nodemailer, { type Transporter } from 'nodemailer';
import { BRAND } from '@cowork/shared';
import { env, isProd, isTest } from '../config.js';
import { logger } from './logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** In tests, sent mail is captured here instead of leaving the process. */
export const testOutbox: MailMessage[] = [];

let transporter: Transporter | null = null;

export function mailConfigured(): boolean {
  return !!(env.SMTP_USER && env.SMTP_PASS);
}

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

export class MailNotConfiguredError extends Error {}

export async function sendMail(msg: MailMessage): Promise<void> {
  if (isTest) {
    testOutbox.push(msg);
    return;
  }
  if (!mailConfigured()) {
    if (isProd && !env.MAIL_LOG_FALLBACK) throw new MailNotConfiguredError('Email sending is not configured (SMTP_USER / SMTP_PASS)');
    // Development without SMTP: print the email so links can be clicked from the console.
    logger.warn(
      { to: msg.to, subject: msg.subject, text: msg.text },
      'SMTP not configured — email printed instead of sent',
    );
    return;
  }
  await getTransporter().sendMail({
    from: env.MAIL_FROM ?? `${BRAND.name} <${env.SMTP_USER}>`,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}

function layout(title: string, body: string, cta: { label: string; url: string }, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#faf7f2;font-family:Segoe UI,Arial,sans-serif;color:#2b1d1a">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #eee3d9;padding:32px">
      <tr><td style="font-size:20px;font-weight:700;color:#6e1f2b">${BRAND.name}</td></tr>
      <tr><td style="padding-top:18px;font-size:22px;font-weight:600">${title}</td></tr>
      <tr><td style="padding-top:10px;font-size:15px;line-height:1.6;color:#5b4a45">${body}</td></tr>
      <tr><td style="padding:26px 0"><a href="${cta.url}" style="background:#6e1f2b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${cta.label}</a></td></tr>
      <tr><td style="font-size:12px;color:#8a7a74;line-height:1.6">${footer}<br/>If the button doesn't work, copy this link:<br/><span style="word-break:break-all">${cta.url}</span></td></tr>
    </table>
    <p style="font-size:12px;color:#8a7a74">${BRAND.name} · ${BRAND.email} · ${BRAND.phoneDisplay}</p>
  </td></tr></table></body></html>`;
}

export function verificationEmail(to: string, name: string, url: string): MailMessage {
  return {
    to,
    subject: `Verify your email for ${BRAND.name}`,
    text: `Hi ${name},\n\nConfirm your email to activate your ${BRAND.name} account and start your 24-hour free trial:\n${url}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`,
    html: layout(
      `Welcome, ${escapeHtml(name)}!`,
      `Confirm your email address to activate your ${BRAND.name} account. Your 24-hour free trial starts as soon as you verify.`,
      { label: 'Verify email', url },
      "This link expires in 24 hours. If you didn't create an account, you can ignore this email.",
    ),
  };
}

export function resetPasswordEmail(to: string, name: string, url: string): MailMessage {
  return {
    to,
    subject: `Reset your ${BRAND.name} password`,
    text: `Hi ${name},\n\nReset your password here (valid for 1 hour):\n${url}\n\nIf you didn't ask for this, ignore this email.`,
    html: layout(
      'Reset your password',
      `Hi ${escapeHtml(name)}, click below to choose a new password.`,
      { label: 'Reset password', url },
      "This link expires in 1 hour. If you didn't request it, your password stays the same.",
    ),
  };
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function accountApprovedEmail(to: string, name: string, loginUrl: string): MailMessage {
  return {
    to,
    subject: `Your ${BRAND.name} account is approved 🎉`,
    text: `Hi ${name},\n\nGood news — your ${BRAND.name} account has been approved and your free trial has started.\nSign in and set up your AI agent: ${loginUrl}\n\nNeed help? WhatsApp us at ${BRAND.phoneDisplay}.`,
    html: layout(
      'You’re approved!',
      `Hi ${escapeHtml(name)}, your ${BRAND.name} account is ready and your free trial has started. Sign in to set up your AI agent and connect WhatsApp or Telegram.`,
      { label: 'Sign in', url: loginUrl },
      `Questions? WhatsApp us at ${BRAND.phoneDisplay}.`,
    ),
  };
}

export function newSignupAdminEmail(
  to: string,
  user: { name: string; email: string; businessName?: string | null },
  reviewUrl: string,
): MailMessage {
  const who = `${user.name} <${user.email}>${user.businessName ? ` — ${user.businessName}` : ''}`;
  return {
    to,
    subject: `New ${BRAND.name} signup waiting for approval: ${user.name}`,
    text: `${who} verified their email and is waiting for access.\nReview: ${reviewUrl}`,
    html: layout(
      'New account waiting for approval',
      `${escapeHtml(who)} verified their email and is waiting for you to grant access.`,
      { label: 'Review in admin', url: reviewUrl },
      'Approve to start their free trial, or suspend/delete the account.',
    ),
  };
}
