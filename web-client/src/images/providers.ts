/**
 * Where card pictures come from (card-assets/README.md):
 *
 *  1. Licensed: card-assets/licensed-images.json, entries with licence
 *     GRANTED only. Empty until written permission exists.
 *  2. User provided: files the player put in card-assets/local.nosync/,
 *     served unchanged by the local development server under /user-art/.
 *     Never part of a build and never uploaded.
 *  3. Otherwise the card is drawn with original artwork (CardArt.tsx).
 *
 * Official card images are not used: Bushiroad's Fan Content Policy does
 * not allow them in web applications or software.
 */

import licensed from '../../../card-assets/licensed-images.json';

export type ImageSource = 'LICENSED' | 'USER';

export interface CardImage {
  url: string;
  source: ImageSource;
  attribution?: string;
}

export interface LicensedEntry {
  cardId: string;
  url: string;
  source: string;
  licence: string;
  permissionRef: string;
  lastVerified: string;
  attribution: string;
}

export interface UserManifest {
  /** Card id → file name in card-assets/local.nosync/. */
  files: Record<string, string>;
  /** Optional source notes from sources.json, by file name. */
  sources: Record<string, { source?: string; licence?: string; note?: string }>;
}

export { cardIdOfFile, fileStemOf } from './files';

/** Only complete entries with licence GRANTED count. */
export function licensedImages(entries: readonly Partial<LicensedEntry>[]): Map<string, CardImage> {
  const map = new Map<string, CardImage>();
  for (const e of entries) {
    if (e.licence !== 'GRANTED' || !e.cardId || !e.url || !e.permissionRef || !e.lastVerified || e.attribution === undefined) continue;
    map.set(e.cardId, { url: e.url, source: 'LICENSED', attribution: e.attribution });
  }
  return map;
}

export class ImageCatalog {
  private user: UserManifest = { files: {}, sources: {} };
  private readonly failed = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(private readonly licensed: Map<string, CardImage>) {}

  setUserManifest(manifest: UserManifest): void {
    this.user = manifest;
    this.changed();
  }

  /** The best picture for a card, or null to draw original artwork. */
  imageFor(cardId: string): CardImage | null {
    const lic = this.licensed.get(cardId);
    if (lic && !this.failed.has(lic.url)) return lic;
    const file = this.user.files[cardId];
    if (file) {
      const url = `/user-art/${encodeURIComponent(file)}`;
      if (!this.failed.has(url)) {
        const note = this.user.sources[file];
        return { url, source: 'USER', ...(note?.source ? { attribution: note.source } : {}) };
      }
    }
    return null;
  }

  /** A picture failed to load: never try it again in this session, fall back to the next source. */
  markFailed(url: string): void {
    if (this.failed.has(url)) return;
    this.failed.add(url);
    this.changed();
  }

  getVersion = (): number => this.version;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

export const catalog = new ImageCatalog(licensedImages((licensed as { images: Partial<LicensedEntry>[] }).images));

/** Loads the list of user-provided pictures from the development server; silently absent elsewhere. */
export async function loadUserImages(fetcher: typeof fetch = fetch): Promise<void> {
  try {
    const response = await fetcher('/user-art/manifest.json');
    if (!response.ok) return;
    const manifest = (await response.json()) as UserManifest;
    if (manifest && typeof manifest.files === 'object') catalog.setUserManifest({ files: manifest.files, sources: manifest.sources ?? {} });
  } catch {
    // No development server (e.g. a built version): original artwork only.
  }
}
