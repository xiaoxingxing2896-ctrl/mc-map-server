import fs from 'node:fs';
import site from './site.json';
export interface HistoryItem { date: string; title: string; authors: string[]; image?: string; description?: string; }
// Wan-s-Mcweb-compatible convention: YYYY-MM-DD_title_author1,author2.webp
export function parseFileName(file: string): HistoryItem | null {
  const match = file.match(/^(\d{4}-\d{2}-\d{2})_([^_]+)_(.+)\.(webp|png|jpe?g|gif)$/i);
  if (!match || Number.isNaN(Date.parse(match[1]))) return null;
  return { date: match[1], title: match[2], authors: match[3].split(',').map(x => x.trim()).filter(Boolean), image: '/history/' + encodeURIComponent(file) };
}
export function getHistory(): HistoryItem[] {
  const folder = new URL('../../public/history/', import.meta.url);
  const images = fs.existsSync(folder) ? fs.readdirSync(folder).map(parseFileName).filter((x): x is HistoryItem => x !== null) : [];
  return [...site.history as HistoryItem[], ...images].sort((a,b) => b.date.localeCompare(a.date));
}
