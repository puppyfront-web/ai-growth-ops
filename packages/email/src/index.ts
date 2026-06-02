/**
 * @ai-growth-ops/email
 *
 * Email sending package with template rendering and provider abstraction.
 */

export { getEmailProvider, createEmailProvider } from './provider.js';
export type { EmailProvider, EmailMessage } from './provider.js';

export {
  welcomeEmail,
  verifyEmailTemplate,
  resetPasswordEmail,
  inviteMemberEmail,
  notificationEmail,
} from './templates/index.js';
export type { EmailTemplate } from './templates/index.js';
