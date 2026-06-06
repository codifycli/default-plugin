import { CodifyCliSender } from '@codifycli/plugin-core';
import * as fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

export interface EnvEntry {
  key: string;
  value: string;
}

const ENV_PARSE_REGEX = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(["']?)(.+?)\2\s*$/;

export function parseEnvFile(content: string): EnvEntry[] {
  const results: EnvEntry[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = ENV_PARSE_REGEX.exec(line);
    if (match) {
      results.push({ key: match[1], value: match[3] });
    }
  }
  return results;
}

export function serializeEnvFile(entries: EnvEntry[]): string {
  return entries.map(({ key, value }) => `${key}="${value}"`).join('\n') + '\n';
}

export function isRemoteCodifyFile(url: string): boolean {
  return url?.startsWith('codify://');
}

export function extractCodifyFileInfo(url: string): { documentId: string; fileId: string } {
  const match = /codify:\/\/([^:]+):(.+)/.exec(url);
  if (!match) {
    throw new Error(`Invalid codify remote file URL: ${url}`);
  }
  return { documentId: match[1], fileId: match[2] };
}

export async function fetchRemoteCodifyFileHash(documentId: string, fileId: string): Promise<string | null> {
  const credentials = await CodifyCliSender.getCodifyCliCredentials();
  const response = await fetch(
    `https://api.codifycli.com/v1/documents/${documentId}/file/${fileId}/hash`,
    { method: 'GET', headers: { Authorization: `Bearer ${credentials}` } },
  );
  if (!response.ok) return null;
  const data: any = await response.json();
  return data.hash ?? null;
}

export async function writeRemoteCodifyFile(documentId: string, fileId: string, destPath: string): Promise<void> {
  const credentials = await CodifyCliSender.getCodifyCliCredentials();
  const response = await fetch(
    `https://api.codifycli.com/v1/documents/${documentId}/file/${fileId}`,
    { method: 'GET', headers: { Authorization: `Bearer ${credentials}` } },
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch remote file codify://${documentId}:${fileId}: ${await response.text()}`);
  }
  const fileStream = fsSync.createWriteStream(destPath, { flags: 'w' });
  await finished(Readable.fromWeb(response.body as any).pipe(fileStream));
}
