/**
 * Email Provider Abstraction
 *
 * Supports: console (dev), resend, smtp (future)
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Console provider — logs emails to stdout (for development)
 */
class ConsoleProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log(`\n━━━ EMAIL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  To: ${message.to}`);
    console.log(`  Subject: ${message.subject}`);
    console.log(`  Text: ${message.text.substring(0, 200)}${message.text.length > 200 ? '...' : ''}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }
}

/**
 * Resend provider — uses resend.com API
 */
class ResendProvider implements EmailProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'AI Growth Ops <noreply@aigrowthops.com>',
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend API error (${response.status}): ${body}`);
    }
  }
}

/**
 * Create the appropriate email provider based on environment
 */
export function createEmailProvider(): EmailProvider {
  const provider = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();

  switch (provider) {
    case 'resend': {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
      return new ResendProvider(apiKey);
    }
    case 'console':
    default:
      return new ConsoleProvider();
  }
}

// Singleton provider instance
let _provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!_provider) {
    _provider = createEmailProvider();
  }
  return _provider;
}
