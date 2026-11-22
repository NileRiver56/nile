export interface SmsAdapter {
  isConfigured(): boolean;
  sendOtp(phone: string, code: string): Promise<{ sent: boolean; reason?: string }>;
}

class UnconfiguredSmsAdapter implements SmsAdapter {
  isConfigured(): boolean {
    return Boolean((process.env.SMS_PROVIDER || '').trim() && (process.env.SMS_API_KEY || '').trim());
  }

  async sendOtp(_phone: string, _code: string): Promise<{ sent: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      return {
        sent: false,
        reason: 'Needs my input: configure SMS_PROVIDER and SMS_API_KEY in environment variables.',
      };
    }
    return {
      sent: false,
      reason: 'External SMS gateway call requires production provider credentials.',
    };
  }
}

export const smsAdapter = new UnconfiguredSmsAdapter();
