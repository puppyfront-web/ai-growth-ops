import { describe, expect, it } from 'vitest';
import { ACQUISITION_CHANNELS, normalizeInquiryChannel } from '@ai-growth-ops/shared';

describe('normalizeInquiryChannel', () => {
  it('合法渠道值原样直通（含新增 IM 渠道）', () => {
    for (const channel of ACQUISITION_CHANNELS) {
      expect(normalizeInquiryChannel(channel)).toBe(channel);
    }
  });

  it('忽略大小写与首尾空白', () => {
    expect(normalizeInquiryChannel('  WhatsApp ')).toBe('whatsapp');
    expect(normalizeInquiryChannel('Telegram')).toBe('telegram');
    expect(normalizeInquiryChannel(' Line ')).toBe('line');
  });

  it('IM 常见别名归一化', () => {
    expect(normalizeInquiryChannel('wa')).toBe('whatsapp');
    expect(normalizeInquiryChannel('whats app')).toBe('whatsapp');
    expect(normalizeInquiryChannel('TG')).toBe('telegram');
    expect(normalizeInquiryChannel('tg')).toBe('telegram');
    expect(normalizeInquiryChannel('电报')).toBe('telegram');
    expect(normalizeInquiryChannel('微信')).toBe('wechat_personal');
    expect(normalizeInquiryChannel('个人微信')).toBe('wechat_personal');
    expect(normalizeInquiryChannel('wechat')).toBe('wechat_personal');
    expect(normalizeInquiryChannel('vx')).toBe('wechat_personal');
    expect(normalizeInquiryChannel('IG')).toBe('instagram');
    expect(normalizeInquiryChannel('ins')).toBe('instagram');
    expect(normalizeInquiryChannel('fb messenger')).toBe('messenger');
    expect(normalizeInquiryChannel('Facebook Messenger')).toBe('messenger');
  });

  it('邮件渠道别名归一化', () => {
    expect(normalizeInquiryChannel('e-mail')).toBe('email');
    expect(normalizeInquiryChannel('mail')).toBe('email');
    expect(normalizeInquiryChannel('邮件')).toBe('email');
    expect(normalizeInquiryChannel('邮箱')).toBe('email');
    expect(normalizeInquiryChannel('电子邮件')).toBe('email');
  });

  it('既有传统渠道不受影响', () => {
    expect(normalizeInquiryChannel('website')).toBe('website');
    expect(normalizeInquiryChannel('exhibition')).toBe('exhibition');
    expect(normalizeInquiryChannel('referral')).toBe('referral');
    expect(normalizeInquiryChannel('phone')).toBe('phone');
  });

  it('未知值与空值回退 other', () => {
    expect(normalizeInquiryChannel('')).toBe('other');
    expect(normalizeInquiryChannel('   ')).toBe('other');
    expect(normalizeInquiryChannel('kakaotalk')).toBe('other');
    expect(normalizeInquiryChannel('某未知渠道')).toBe('other');
  });

  it('ACQUISITION_CHANNELS 覆盖既有 14 渠道与新增 7 个 IM 渠道', () => {
    expect(ACQUISITION_CHANNELS).toHaveLength(21);
    for (const channel of [
      'whatsapp',
      'telegram',
      'wechat_personal',
      'email',
      'messenger',
      'instagram',
      'line'
    ]) {
      expect(ACQUISITION_CHANNELS).toContain(channel);
    }
  });
});
