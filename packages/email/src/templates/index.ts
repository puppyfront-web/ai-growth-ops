/**
 * Email Templates
 *
 * Each template returns { subject, html, text } for a given context.
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function baseHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <tr><td style="background:#0d9488;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">AI Growth Ops</h1>
    </td></tr>
    <tr><td style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a1a;">${title}</h2>
      ${bodyHtml}
    </td></tr>
    <tr><td style="padding:16px 32px 24px;color:#888;font-size:12px;text-align:center;">
      AI Growth Ops — AI 全域内容获客运营系统
    </td></tr>
  </table>
</body>
</html>`;
}

function buttonHtml(url: string, label: string): string {
  return `<div style="text-align:center;margin:24px 0;">
  <a href="${url}" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;">${label}</a>
</div>
<p style="color:#888;font-size:13px;text-align:center;">如果按钮无法点击，请复制以下链接到浏览器打开：<br><a href="${url}" style="color:#0d9488;word-break:break-all;">${url}</a></p>`;
}

// ── Welcome Email ──────────────────────────────────────────────────────────

export function welcomeEmail(params: {
  name: string;
  verifyUrl: string;
}): EmailTemplate {
  const { name, verifyUrl } = params;
  return {
    subject: '欢迎加入 AI Growth Ops！',
    html: baseHtml(
      '欢迎加入！',
      `
      <p style="color:#333;font-size:15px;line-height:1.6;">你好 ${name}，</p>
      <p style="color:#333;font-size:15px;line-height:1.6;">欢迎加入 AI Growth Ops！我们很高兴你的到来。</p>
      <p style="color:#333;font-size:15px;line-height:1.6;">请点击下方按钮验证你的邮箱地址，以激活账户的所有功能：</p>
      ${buttonHtml(verifyUrl, '验证邮箱')}
    `
    ),
    text: `你好 ${name}，\n\n欢迎加入 AI Growth Ops！\n\n请点击以下链接验证你的邮箱地址：\n${verifyUrl}`
  };
}

// ── Email Verification ─────────────────────────────────────────────────────

export function verifyEmailTemplate(params: {
  name: string;
  verifyUrl: string;
}): EmailTemplate {
  const { name, verifyUrl } = params;
  return {
    subject: '验证你的邮箱地址',
    html: baseHtml(
      '验证邮箱',
      `
      <p style="color:#333;font-size:15px;line-height:1.6;">你好 ${name}，</p>
      <p style="color:#333;font-size:15px;line-height:1.6;">请点击下方按钮验证你的邮箱地址：</p>
      ${buttonHtml(verifyUrl, '验证邮箱')}
      <p style="color:#888;font-size:13px;">此链接有效期为 24 小时。如果你没有请求验证，请忽略此邮件。</p>
    `
    ),
    text: `你好 ${name}，\n\n请点击以下链接验证你的邮箱地址：\n${verifyUrl}\n\n此链接有效期为 24 小时。`
  };
}

// ── Password Reset ─────────────────────────────────────────────────────────

export function resetPasswordEmail(params: {
  name: string;
  resetUrl: string;
}): EmailTemplate {
  const { name, resetUrl } = params;
  return {
    subject: '重置你的密码',
    html: baseHtml(
      '重置密码',
      `
      <p style="color:#333;font-size:15px;line-height:1.6;">你好 ${name}，</p>
      <p style="color:#333;font-size:15px;line-height:1.6;">我们收到了你重置密码的请求。点击下方按钮设置新密码：</p>
      ${buttonHtml(resetUrl, '重置密码')}
      <p style="color:#888;font-size:13px;">此链接有效期为 1 小时。如果你没有请求重置密码，请忽略此邮件。</p>
    `
    ),
    text: `你好 ${name}，\n\n请点击以下链接重置你的密码：\n${resetUrl}\n\n此链接有效期为 1 小时。`
  };
}

// ── Team Invitation ────────────────────────────────────────────────────────

export function inviteMemberEmail(params: {
  inviterName: string;
  orgName: string;
  acceptUrl: string;
}): EmailTemplate {
  const { inviterName, orgName, acceptUrl } = params;
  return {
    subject: `${inviterName} 邀请你加入 ${orgName}`,
    html: baseHtml(
      '团队邀请',
      `
      <p style="color:#333;font-size:15px;line-height:1.6;"><strong>${inviterName}</strong> 邀请你加入组织 <strong>${orgName}</strong>。</p>
      <p style="color:#333;font-size:15px;line-height:1.6;">点击下方按钮接受邀请：</p>
      ${buttonHtml(acceptUrl, '接受邀请')}
      <p style="color:#888;font-size:13px;">此邀请有效期为 7 天。</p>
    `
    ),
    text: `${inviterName} 邀请你加入组织 ${orgName}。\n\n请点击以下链接接受邀请：\n${acceptUrl}\n\n此邀请有效期为 7 天。`
  };
}

// ── Notification Digest ────────────────────────────────────────────────────

export function notificationEmail(params: {
  name: string;
  notifications: Array<{ title: string; content: string; actionUrl?: string }>;
}): EmailTemplate {
  const { name, notifications } = params;
  const itemsHtml = notifications
    .map(
      (n) =>
        `<div style="padding:12px 0;border-bottom:1px solid #eee;">
      <p style="margin:0;font-size:14px;font-weight:500;color:#1a1a1a;">${n.title}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#666;">${n.content}</p>
      ${n.actionUrl ? `<a href="${n.actionUrl}" style="font-size:13px;color:#0d9488;">查看详情 →</a>` : ''}
    </div>`
    )
    .join('');

  return {
    subject: `你有 ${notifications.length} 条新通知`,
    html: baseHtml(
      `${notifications.length} 条新通知`,
      `
      <p style="color:#333;font-size:15px;line-height:1.6;">你好 ${name}，以下是你的最新通知：</p>
      ${itemsHtml}
    `
    ),
    text:
      `你好 ${name}，\n\n你有 ${notifications.length} 条新通知：\n\n` +
      notifications.map((n) => `- ${n.title}: ${n.content}`).join('\n')
  };
}
