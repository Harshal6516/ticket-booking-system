import nodemailer from 'nodemailer';
import { env } from '../config/env';

let transporter: nodemailer.Transporter | null = null;
let isEthereal = false;

/**
 * Initializes or returns the cached nodemailer transporter.
 * If SMTP credentials are provided, uses standard SMTP.
 * Otherwise, falls back to an Ethereal test account with preview URLs.
 */
async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) {
    return transporter;
  }

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    console.log(`[Email] Configuring SMTP transporter (${env.SMTP_HOST}:${env.SMTP_PORT})`);
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
    isEthereal = false;
  } else {
    console.log('[Email] No SMTP credentials provided. Creating Ethereal test account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      isEthereal = true;
      console.log(`[Email] Ethereal test account initialized: ${testAccount.user}`);
    } catch (etherealErr) {
      console.warn('[Email] Failed to create Ethereal account, falling back to JSON console transporter:', etherealErr);
      transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      isEthereal = false;
    }
  }

  return transporter;
}

function getSenderAddress(): string {
  return `"${env.FROM_NAME}" <${env.FROM_EMAIL}>`;
}

/**
 * Send booking confirmation email with QR code.
 */
export async function sendBookingConfirmationEmail(params: {
  to: string;
  customerName: string;
  bookingRef: string;
  eventTitle: string;
  showDate: string;
  showTime: string;
  venueName: string;
  seats: string[];
  totalPrice: number;
  qrCodeDataUrl: string;
}): Promise<void> {
  const { to, customerName, bookingRef, eventTitle, showDate, showTime, venueName, seats, totalPrice, qrCodeDataUrl } = params;

  try {
    const t = await getTransporter();

    // Extract base64 image data from data URL
    const base64Data = qrCodeDataUrl.includes(',') ? qrCodeDataUrl.split(',')[1] : qrCodeDataUrl;

    const formattedDate = new Date(showDate).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const info = await t.sendMail({
      from: getSenderAddress(),
      to,
      subject: `🎟️ Booking Confirmed — ${eventTitle} (${bookingRef})`,
      text: `Hi ${customerName},\n\nYour booking for ${eventTitle} is confirmed!\n\nBooking Reference: ${bookingRef}\nDate: ${formattedDate}\nTime: ${showTime}\nVenue: ${venueName}\nSeats: ${seats.join(', ')}\nTotal: ₹${totalPrice.toFixed(2)}\n\nPlease find your QR ticket attached.\n\nThank you for booking with ${env.FROM_NAME}!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Booking Confirmed</title>
        </head>
        <body style="margin: 0; padding: 20px; background-color: #0f172a; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
          <div style="max-width: 580px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            
            <!-- Header Banner -->
            <div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">🎟️ Booking Confirmed!</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 15px;">Your ticket is ready. See you at the event!</p>
            </div>
            
            <!-- Body Content -->
            <div style="padding: 32px 24px;">
              <p style="font-size: 17px; margin: 0 0 8px 0; color: #f8fafc;">Hi <strong>${customerName}</strong>,</p>
              <p style="color: #94a3b8; font-size: 14px; margin: 0 0 24px 0; line-height: 1.5;">
                Thank you for your reservation. Here are your verified booking details:
              </p>
              
              <!-- Details Card -->
              <div style="background: #0f172a; border-radius: 12px; padding: 20px; border: 1px solid #334155; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Event</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #f8fafc;">${eventTitle}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Date</td>
                    <td style="padding: 8px 0; text-align: right; color: #f8fafc;">${formattedDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Time</td>
                    <td style="padding: 8px 0; text-align: right; color: #f8fafc;">${showTime}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Venue</td>
                    <td style="padding: 8px 0; text-align: right; color: #f8fafc;">${venueName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Seats</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #a855f7;">${seats.join(', ')}</td>
                  </tr>
                  <tr style="border-top: 1px solid #334155;">
                    <td style="padding: 12px 0 4px 0; color: #94a3b8; font-weight: 600;">Total Paid</td>
                    <td style="padding: 12px 0 4px 0; text-align: right; font-size: 20px; font-weight: 800; color: #22c55e;">₹${totalPrice.toFixed(2)}</td>
                  </tr>
                </table>
              </div>

              <!-- Booking Reference Badge -->
              <div style="text-align: center; margin: 24px 0; padding: 16px; background: #0f172a; border-radius: 10px; border: 1px dashed #6366f1;">
                <span style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 4px;">Booking Reference</span>
                <span style="font-size: 22px; font-weight: 800; letter-spacing: 3px; color: #818cf8; font-family: monospace;">${bookingRef}</span>
              </div>

              <!-- QR Code Container -->
              <div style="text-align: center; margin: 28px 0;">
                <p style="color: #94a3b8; font-size: 13px; margin: 0 0 12px 0;">Show this QR code at the entrance for direct scan & entry:</p>
                <div style="display: inline-block; padding: 12px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                  <img src="cid:qrcode" alt="Booking QR Code" style="width: 180px; height: 180px; display: block;" />
                </div>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background: #0f172a; padding: 18px 24px; text-align: center; border-top: 1px solid #334155;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">This is an automated confirmation from ${env.FROM_NAME}. Please do not reply directly to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      attachments: [
        {
          filename: `ticket-${bookingRef}.png`,
          content: base64Data,
          encoding: 'base64',
          cid: 'qrcode',
        },
      ],
    });

    console.log(`[Email] ✅ Booking confirmation email sent to ${to} (Ref: ${bookingRef})`);
    if (isEthereal) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[Email] 📧 View email preview in browser: ${previewUrl}`);
    }
  } catch (err) {
    console.error(`[Email] ❌ Failed to send booking confirmation email to ${to}:`, err);
  }
}

/**
 * Send waitlist offer email with time-limited claim link.
 */
export async function sendWaitlistOfferEmail(params: {
  to: string;
  customerName: string;
  eventTitle: string;
  showDate: string;
  showTime: string;
  venueName: string;
  category: string;
  offerToken: string;
  expiresAt: Date;
}): Promise<void> {
  const { to, customerName, eventTitle, showDate, showTime, venueName, category, offerToken, expiresAt } = params;

  try {
    const t = await getTransporter();

    const offerUrl = `${env.FRONTEND_URL}/offers/${offerToken}`;
    const expiresIn = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));

    const formattedDate = new Date(showDate).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const info = await t.sendMail({
      from: getSenderAddress(),
      to,
      subject: `🎉 A seat is available for you — ${eventTitle}!`,
      text: `Hi ${customerName},\n\nGreat news! A ${category} seat has become available for ${eventTitle} at ${venueName} on ${formattedDate} at ${showTime}.\n\nAccept your offer before it expires in ${expiresIn} minutes:\n${offerUrl}\n\nIf you do not accept within ${expiresIn} minutes, the seat will be offered to the next person in line.`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Waitlist Offer</title>
        </head>
        <body style="margin: 0; padding: 20px; background-color: #0f172a; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
          <div style="max-width: 580px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            
            <!-- Header Banner -->
            <div style="background: linear-gradient(135deg, #ec4899 0%, #f43f5e 100%); padding: 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">🎉 You've Got a Seat!</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 15px;">A waitlisted seat is now reserved for you.</p>
            </div>
            
            <!-- Body Content -->
            <div style="padding: 32px 24px;">
              <p style="font-size: 17px; margin: 0 0 8px 0; color: #f8fafc;">Hi <strong>${customerName}</strong>,</p>
              <p style="color: #94a3b8; font-size: 14px; margin: 0 0 24px 0; line-height: 1.5;">
                A <strong style="color: #ec4899;">${category}</strong> seat just opened up for you! Details are below:
              </p>
              
              <!-- Details Card -->
              <div style="background: #0f172a; border-radius: 12px; padding: 20px; border: 1px solid #334155; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Event</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #f8fafc;">${eventTitle}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Date & Time</td>
                    <td style="padding: 8px 0; text-align: right; color: #f8fafc;">${formattedDate} at ${showTime}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Venue</td>
                    <td style="padding: 8px 0; text-align: right; color: #f8fafc;">${venueName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #94a3b8;">Category</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #ec4899;">${category}</td>
                  </tr>
                </table>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${offerUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); color: #ffffff; text-decoration: none; padding: 16px 36px; border-radius: 10px; font-size: 16px; font-weight: 700; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);">
                  👉 Accept Offer & Confirm Ticket
                </a>
              </div>

              <!-- Expiry Alert -->
              <div style="background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 10px; padding: 16px; text-align: center;">
                <p style="margin: 0; color: #fb7185; font-weight: 700; font-size: 14px;">⏰ This offer expires in ${expiresIn} minutes</p>
                <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 12px;">If you do not complete your booking in time, the seat will automatically pass to the next waiting customer.</p>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background: #0f172a; padding: 18px 24px; text-align: center; border-top: 1px solid #334155;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">This is an automated message from ${env.FROM_NAME}. Please do not reply directly to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`[Email] ✅ Waitlist offer email sent to ${to} (Token: ${offerToken})`);
    if (isEthereal) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[Email] 📧 View email preview in browser: ${previewUrl}`);
    }
  } catch (err) {
    console.error(`[Email] ❌ Failed to send waitlist offer email to ${to}:`, err);
  }
}
