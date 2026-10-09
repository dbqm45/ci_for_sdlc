const FIGMA_URL_KEY = /^(?:https?:\/\/)?(?:www\.)?figma\.com\/(?:file|design|proto)\/([a-zA-Z0-9]+)(?:[/?]|$)/;

/** Accepts either a bare Figma file key or a figma.com file/design/proto URL and returns just the key. */
export function parseFigmaFileKey(raw: string): string {
  const trimmed = raw.trim();
  return FIGMA_URL_KEY.exec(trimmed)?.[1] ?? trimmed;
}
