import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';

export async function sendOutageRestoredEmail(
  startTime: Date,
  endTime: Date,
  durationSec: number
): Promise<void> {
  // Check if email is configured
  if (!process.env.SMTP_HOST || !process.env.EMAIL_TO) {
    console.log('Email not configured, skipping notification');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const durationMin = Math.floor(durationSec / 60);
  const durationHours = Math.floor(durationMin / 60);
  const durationDisplay = durationHours > 0
    ? `${durationHours}h ${durationMin % 60}m`
    : `${durationMin}m ${durationSec % 60}s`;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: '🟢 WAN Connection Restored',
    html: `
      <h2>WAN Connection Restored</h2>
      <p>Your internet connection has been restored.</p>
      <ul>
        <li><strong>Outage Start:</strong> ${startTime.toLocaleString()}</li>
        <li><strong>Restored At:</strong> ${endTime.toLocaleString()}</li>
        <li><strong>Duration:</strong> ${durationDisplay}</li>
      </ul>
      <p><a href="${process.env.APP_URL || 'http://localhost:3000'}/dashboard">View Dashboard</a></p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);

    await prisma.systemLog.create({
      data: {
        level: 'INFO',
        message: 'Outage notification email sent',
        metadata: JSON.stringify({ durationSec })
      }
    });
  } catch (error) {
    await prisma.systemLog.create({
      data: {
        level: 'ERROR',
        message: 'Failed to send email notification',
        metadata: JSON.stringify({ error: String(error) })
      }
    });
  }
}
