// In-memory store for OTPs with expiration and rate limiting
interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpEntry>();
const rateLimitStore = new Map<string, number>();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute cooldown per phone

export async function sendOtp(phoneNumber: string): Promise<{ success: boolean; devCode?: string; message: string }> {
  const now = Date.now();
  const lastSent = rateLimitStore.get(phoneNumber);
  
  if (lastSent && now - lastSent < 30 * 1000) {
    throw new Error('Please wait 30 seconds before requesting another OTP');
  }

  rateLimitStore.set(phoneNumber, now);

  // Generate 6 digit code
  const isDev = process.env.NODE_ENV !== 'production';
  const devCode = process.env.DEV_OTP_CODE || '123456';
  const code = isDev ? devCode : Math.floor(100000 + Math.random() * 900000).toString();

  otpStore.set(phoneNumber, {
    code,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
  });

  // If TWILIO credentials configured, send real SMS
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      if (process.env.TWILIO_VERIFY_SERVICE_SID) {
        await client.verify.v2
          .services(process.env.TWILIO_VERIFY_SERVICE_SID)
          .verifications.create({ to: phoneNumber, channel: 'sms' });
      }
    } catch (err) {
      console.warn('Twilio SMS delivery error (falling back to generated OTP):', err);
    }
  }

  return {
    success: true,
    message: 'OTP sent successfully',
    devCode: isDev ? code : undefined,
  };
}

export async function verifyOtp(phoneNumber: string, inputCode: string): Promise<boolean> {
  const entry = otpStore.get(phoneNumber);

  // Dev code override for fast automated testing
  if (process.env.DEV_OTP_CODE && inputCode === process.env.DEV_OTP_CODE) {
    otpStore.delete(phoneNumber);
    return true;
  }

  if (!entry) {
    return false;
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phoneNumber);
    return false;
  }

  if (entry.attempts >= 5) {
    otpStore.delete(phoneNumber);
    throw new Error('Maximum verification attempts exceeded. Please request a new OTP.');
  }

  entry.attempts++;

  if (entry.code === inputCode) {
    otpStore.delete(phoneNumber);
    return true;
  }

  return false;
}
