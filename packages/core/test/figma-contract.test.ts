import { afterEach, describe, expect, it } from 'vitest';
import { demoProject, fetchFigma } from '../src/index.js';
import { clearFigmaCache } from '../src/connectors/figma.js';
import { DUMMY_FIGMA_TOKEN, startFigmaMock, type FigmaMock } from './mocks/figma-mock.js';

// Contract test: the real connector (real fetch, real HTTP) against the local Figma mock built from demo data.
let mock: FigmaMock | undefined;

afterEach(async () => {
  await mock?.close();
  mock = undefined;
  clearFigmaCache();
});

const comparable = (frames: { id: string; fileKey: string; page: string; name: string; texts: string[]; transitions: string[] }[]) =>
  frames.map(({ id, fileKey, page, name, texts, transitions }) => ({ id, fileKey, page, name, texts, transitions })).sort((a, b) => a.id.localeCompare(b.id));

describe('Figma connector against the mock API', () => {
  it('FC-01: reads back every demo frame with its page, texts and prototype transitions', async () => {
    const { frames } = demoProject();
    mock = await startFigmaMock({ frames });
    const fileKeys = [...new Set(frames.map((f) => f.fileKey))];
    const result = await fetchFigma({ token: DUMMY_FIGMA_TOKEN, fileKeys, apiBase: mock.apiBase });
    expect(comparable(result)).toEqual(comparable(frames));
    expect(result.every((f) => f.fileName === 'Checkout App')).toBe(true);
    expect(mock.requests).toEqual(fileKeys.flatMap((k) => [`/v1/files/${k}/components`, `/v1/files/${k}?depth=3`]));
  });

  it('FC-02: a token other than the dummy one gets 403 and the error names the file', async () => {
    mock = await startFigmaMock({ frames: demoProject().frames });
    await expect(fetchFigma({ token: 'figd_real-looking', fileKeys: ['FIGCHK01'], apiBase: mock.apiBase })).rejects.toThrow(/FIGCHK01 → HTTP 403/);
  });

  it('FC-03: an unknown file key gets 404', async () => {
    mock = await startFigmaMock({ frames: demoProject().frames });
    await expect(fetchFigma({ token: DUMMY_FIGMA_TOKEN, fileKeys: ['NOPE'], apiBase: mock.apiBase })).rejects.toThrow(/NOPE → HTTP 404/);
  });

  it('FC-04: retries after a 429 and then reads the file', async () => {
    mock = await startFigmaMock({ frames: demoProject().frames, rateLimitFirst: 1 });
    const result = await fetchFigma({ token: DUMMY_FIGMA_TOKEN, fileKeys: ['FIGCHK01'], apiBase: mock.apiBase });
    expect(result.length).toBeGreaterThan(0);
    expect(mock.requests[0]).toBe(mock.requests[1]);
  });
});
