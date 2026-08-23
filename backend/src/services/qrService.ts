import QRCode from 'qrcode';

/**
 * Generate a QR code as a base64 data URL encoding the booking reference.
 */
export async function generateQRCode(bookingRef: string): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(bookingRef, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
    return dataUrl;
  } catch (err) {
    console.error('QR code generation error:', err);
    throw new Error('Failed to generate QR code');
  }
}
