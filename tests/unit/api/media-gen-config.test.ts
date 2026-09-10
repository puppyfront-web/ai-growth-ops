import { describe, expect, it } from 'vitest';
import {
  credentialsFromSaved,
  generationEndpoint,
  isMaskedSecret,
  mergeMediaGeneration,
  pickGeneratedMediaUrl,
  publicMediaGeneration
} from '../../../apps/api/src/services/media-gen-config.js';

describe('media-gen-config', () => {
  it('picks image and video urls from common payloads', () => {
    expect(
      pickGeneratedMediaUrl({ data: [{ url: 'https://cdn.example/a.png' }] })
    ).toEqual({ url: 'https://cdn.example/a.png', b64: undefined });
    expect(pickGeneratedMediaUrl({ video_url: 'https://cdn.example/a.mp4' })).toEqual({
      url: 'https://cdn.example/a.mp4',
      b64: undefined
    });
    expect(pickGeneratedMediaUrl({ data: [{ b64_json: 'abcd' }] })).toEqual({
      url: undefined,
      b64: 'abcd'
    });
  });

  it('keeps stored secrets when the incoming value is masked', () => {
    const merged = mergeMediaGeneration(
      { apiKey: '••••••••', videoApiKey: '', model: 'dall-e-3' },
      { apiKey: 'sk-live', videoApiKey: 'sk-video', model: 'old' }
    );
    expect(merged.apiKey).toBe('sk-live');
    expect(merged.videoApiKey).toBe('sk-video');
    expect(merged.model).toBe('dall-e-3');
    expect(isMaskedSecret('••••••••')).toBe(true);
  });

  it('resolves dedicated video credentials from saved config first', () => {
    const creds = credentialsFromSaved(
      {
        mediaGeneration: {
          videoMode: 'dedicated',
          videoApiKey: 'sk-video',
          videoBaseUrl: 'https://video.example/v1',
          videoModel: 'sora-2'
        }
      },
      'video',
      {}
    );
    expect(creds).toEqual({
      provider: 'openai',
      apiKey: 'sk-video',
      baseUrl: 'https://video.example/v1',
      model: 'sora-2'
    });
  });

  it('builds OpenAI-compatible generation endpoints', () => {
    expect(generationEndpoint('https://api.openai.com/v1', 'image')).toBe(
      'https://api.openai.com/v1/images/generations'
    );
    expect(generationEndpoint('https://api.openai.com/v1/', 'video')).toBe(
      'https://api.openai.com/v1/videos/generations'
    );
    expect(
      generationEndpoint('https://api.example/v1/videos/generations', 'video')
    ).toBe('https://api.example/v1/videos/generations');
  });

  it('masks configured keys in public settings', () => {
    const published = publicMediaGeneration({
      apiKey: 'sk-image',
      videoApiKey: 'sk-video',
      model: 'dall-e-3'
    });
    expect(published.apiKey).toBe('••••••••');
    expect(published.videoApiKey).toBe('••••••••');
    expect(published.model).toBe('dall-e-3');
  });
});
