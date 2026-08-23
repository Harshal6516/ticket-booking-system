import { Resend } from 'resend';
import { env } from '../config/env';

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
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

  if (!env.RESEND_API_KEY) {
    console.log(`[Email] Skipping email (no API key configured). Booking: ${bookingRef}, To: ${to}`);
    return;
  }

  try {
    // Convert data URL to base64 for attachment
    const base64Data = qrCodeDataUrl.split(',')[1];

    await getResend().emails.send({
      from: env.FROM_EMAIL,
      to: [to],
      subject: `🎫 Booking Confirmed — ${eventTitle}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #eee; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; color: white;">🎫 Booking Confirmed!</h1>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 18px; margin-bottom: 5px;">Hi <strong>${customerName}</strong>,</p>
            <p style="color: #aaa; margin-top: 5px;">Your booking has been confirmed. Here are the details:</p>
            
            <div style="background: #16213e; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Event</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: bold;">${eventTitle}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Date</td>
                  <td style="padding: 8px 0; text-align: right;">${showDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Time</td>
                  <td style="padding: 8px 0; text-align: right;">${showTime}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Venue</td>
                  <td style="padding: 8px 0; text-align: right;">${venueName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Seats</td>
                  <td style="padding: 8px 0; text-align: right;">${seats.join(', ')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa; border-top: 1px solid #333;">Total</td>
                  <td style="padding: 8px 0; text-align: right; border-top: 1px solid #333; font-size: 20px; font-weight: bold; color: #667eea;">₹${totalPrice.toFixed(2)}</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin: 20px 0;">
              <p style="color: #aaa; margin-bottom: 10px;">Booking Reference</p>
              <p style="font-size: 18px; font-weight: bold; letter-spacing: 2px; color: #667eea;">${bookingRef}</p>
            </div>

            <div style="text-align: center; margin: 20px 0;">
              <p style="color: #aaa; margin-bottom: 10px;">Show this QR code at entry</p>
              <img src="cid:qrcode" alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px;" />
            </div>
          </div>
          <div style="background: #0f3460; padding: 15px; text-align: center; color: #aaa; font-size: 12px;">
            <p style="margin: 0;">This is an automated confirmation. Please do not reply.</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: 'qrcode.png',
          content: base64Data,
          contentType: 'image/png',
        },
      ],
    });

    console.log(`[Email] Booking confirmation sent to ${to} for ref ${bookingRef}`);
  } catch (err) {
    console.error(`[Email] Failed to send booking confirmation to ${to}:`, err);
    // Don't throw — email failure shouldn't break the booking
  }
}

/**
 * Send waitlist offer email with time-limited link.
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

  if (!env.RESEND_API_KEY) {
    console.log(`[Email] Skipping waitlist offer email (no API key). Token: ${offerToken}, To: ${to}`);
    return;
  }

  const offerUrl = `${env.FRONTEND_URL}/offers/${offerToken}`;
  const expiresIn = Math.round((expiresAt.getTime() - Date.now()) / 60000);

  try {
    await getResend().emails.send({
      from: env.FROM_EMAIL,
      to: [to],
      subject: `🎉 A seat is available — ${eventTitle}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #eee; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; color: white;">🎉 A Seat is Available!</h1>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 18px; margin-bottom: 5px;">Hi <strong>${customerName}</strong>,</p>
            <p style="color: #aaa;">Great news! A <strong>${category}</strong> seat has become available for:</p>
            
            <div style="background: #16213e; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>${eventTitle}</strong></p>
              <p style="margin: 5px 0; color: #aaa;">${showDate} at ${showTime}</p>
              <p style="margin: 5px 0; color: #aaa;">${venueName}</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${offerUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-size: 16px; font-weight: bold;">
                Accept This Offer
              </a>
            </div>

            <div style="background: #16213e; border-radius: 8px; padding: 15px; text-align: center;">
              <p style="margin: 0; color: #f5576c; font-weight: bold;">⏰ This offer expires in ${expiresIn} minutes</p>
              <p style="margin: 5px 0 0 0; color: #aaa; font-size: 12px;">If you don't accept in time, the seat will be offered to the next person.</p>
            </div>
          </div>
        </div>
      `,
    });

    console.log(`[Email] Waitlist offer sent to ${to}, token: ${offerToken}`);
  } catch (err) {
    console.error(`[Email] Failed to send waitlist offer to ${to}:`, err);
  }
}
