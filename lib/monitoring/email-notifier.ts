import nodemailer from 'nodemailer';
import { getErrorMessage } from '@/lib/utils';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export async function sendOutageRestoredEmail(
  startTime: Date,
  endTime: Date,
  durationSec: number
): Promise<void> {
  // Check if email is configured
  if (!env.SMTP_HOST || !env.EMAIL_TO) {
    logger.debug('Email not configured, skipping notification');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: parseInt(env.SMTP_PORT || '587'),
    secure: env.SMTP_SECURE === 'true',
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });

  const durationMin = Math.floor(durationSec / 60);
  const durationHours = Math.floor(durationMin / 60);
  const durationDisplay = durationHours > 0
    ? `${durationHours}h ${durationMin % 60}m`
    : `${durationMin}m ${durationSec % 60}s`;

  const mailOptions = {
    from: env.EMAIL_FROM,
    to: env.EMAIL_TO,
    subject: '🟢 WanWatch - Connection Restored',
    html: `
      <h2>Internet Connection Restored</h2>
      <p>Your internet connection has been restored.</p>
      <ul>
        <li><strong>Outage Start:</strong> ${startTime.toLocaleString()}</li>
        <li><strong>Restored At:</strong> ${endTime.toLocaleString()}</li>
        <li><strong>Duration:</strong> ${durationDisplay}</li>
      </ul>
      <p><a href="${env.APP_URL || 'http://localhost:3000'}/dashboard">View Dashboard</a></p>
      <hr style="margin-top: 20px; border: none; border-top: 1px solid #ddd;">
      <p style="color: #666; font-size: 12px;">Sent by WanWatch</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);

    // Log successful email send
    await logger.logEmail('success', env.EMAIL_TO, 'Connection Restored', {
      durationSec,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);

    // Log email failure
    await logger.logEmail('failure', env.EMAIL_TO || 'unknown', 'Connection Restored', {
      error: errorMessage,
      durationSec
    });
  }
}
