import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { GoogleGenAI } from '@google/genai';

import type { Archiver, ArchiverOptions } from 'archiver';

const require = createRequire(import.meta.url);
const archiver = require('archiver') as (
  format: 'zip' | 'tar',
  options?: ArchiverOptions
) => Archiver;
import type {
  CategoryConfig,
  CategorySummary,
  LibraryConfig,
  LibrarySnapshot,
  OAuthProviderId,
  SavedMediaItem,
  SocialAuthStatusResponse,
  SocialPostResult,
  VideoTypeFilter,
} from './src/types.ts';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT) || 3000;
const LIBRARY_DIR = path.resolve(process.cwd(), 'biblioteca');
const CONFIG_PATH = path.resolve(LIBRARY_DIR, '_config.json');
const MAX_DOWNLOAD_BYTES = 120 * 1024 * 1024; // 120 MB safety cap
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB HTML parse cap

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

const DEFAULT_CATEGORIES: CategoryConfig[] = [
  {
    slug: 'tecnologia',
    name: 'Tecnologia',
    keywords: [
      'ia',
      'ai',
      'inteligencia artificial',
      'programacao',
      'codigo',
      'dev',
      'software',
      'tech',
      'gadget',
      'automacao',
      'n8n',
      'react',
      'python',
      'robotica',
    ],
    createdAt: new Date().toISOString(),
  },
  {
    slug: 'design-e-criacao',
    name: 'Design e Criação',
    keywords: [
      'design',
      'ui',
      'ux',
      'figma',
      'edicao',
      'cinema',
      'fotografia',
      '3d',
      'motion',
      'color grading',
      'ilustracao',
      'branding',
    ],
    createdAt: new Date().toISOString(),
  },
  {
    slug: 'educacao-e-tutoriais',
    name: 'Educação e Tutoriais',
    keywords: [
      'tutorial',
      'como fazer',
      'aula',
      'curso',
      'dica',
      'passo a passo',
      'guia',
      'aprender',
      'ciencia',
      'historia',
      'documentario',
    ],
    createdAt: new Date().toISOString(),
  },
  {
    slug: 'negocios-e-marketing',
    name: 'Negócios e Marketing',
    keywords: [
      'negocio',
      'marketing',
      'vendas',
      'startup',
      'produtividade',
      'financas',
      'empreendedorismo',
      'conteudo',
      'social media',
      'estrategia',
    ],
    createdAt: new Date().toISOString(),
  },
  {
    slug: 'entretenimento',
    name: 'Entretenimento',
    keywords: [
      'humor',
      'comedia',
      'musica',
      'filme',
      'serie',
      'jogo',
      'game',
      'podcast',
      'corte',
      'entretenimento',
      'esporte',
    ],
    createdAt: new Date().toISOString(),
  },
  {
    slug: 'estilo-de-vida',
    name: 'Estilo de Vida',
    keywords: [
      'receita',
      'culinaria',
      'treino',
      'fitness',
      'saude',
      'viagem',
      'arquitetura',
      'casa',
      'rotina',
      'bem-estar',
    ],
    createdAt: new Date().toISOString(),
  },
];

function slugify(input: string, fallback = 'item'): string {
  const cleaned = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || `${fallback}-${crypto.randomBytes(3).toString('hex')}`;
}

function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function resolveSafeLibraryPath(...segments: string[]): string {
  const target = path.resolve(LIBRARY_DIR, ...segments);
  if (target !== LIBRARY_DIR && !target.startsWith(LIBRARY_DIR + path.sep)) {
    throw new Error('Acesso de caminho fora do diretório da biblioteca bloqueado.');
  }
  return target;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('::ffff:127.') ||
      lower.startsWith('::ffff:10.') ||
      lower.startsWith('::ffff:192.168.') ||
      lower.startsWith('::ffff:169.254.')
    ) {
      return true;
    }
    return false;
  }
  return true;
}

async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL inválida fornecida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Somente URLs HTTP ou HTTPS são permitidas.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Credenciais embutidas na URL não são permitidas.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    throw new Error('Destino de rede local ou interno não permitido.');
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('Endereço IP privado ou reservado não permitido.');
    }
    return parsed;
  }

  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length) {
    throw new Error('Não foi possível resolver o domínio informado.');
  }
  for (const addr of addresses) {
    if (isPrivateOrReservedIp(addr.address)) {
      throw new Error('Domínio resolve para endereço de rede privada bloqueado.');
    }
  }
  return parsed;
}

async function safeFetch(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number } = {},
  maxRedirects = 4
): Promise<Response> {
  let currentUrl = rawUrl;
  const timeoutMs = init.timeoutMs ?? 15000;

  for (let i = 0; i <= maxRedirects; i++) {
    const validated = await assertSafePublicUrl(currentUrl);
    const response = await fetch(validated.toString(), {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; AcervoClip/1.0; +https://acervoclip.local)',
        ...(init.headers || {}),
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return response;
      currentUrl = new URL(location, validated).toString();
      continue;
    }

    return response;
  }

  throw new Error('Número máximo de redirecionamentos excedido.');
}

async function ensureLibraryInitialized(): Promise<LibraryConfig> {
  await fsp.mkdir(LIBRARY_DIR, { recursive: true });

  let config: LibraryConfig;
  try {
    const raw = await fsp.readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as LibraryConfig;
    if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) {
      throw new Error('Config vazia');
    }
    config = parsed;
  } catch {
    config = {
      aiAutoCategorize: true,
      categories: DEFAULT_CATEGORIES,
    };
    await fsp.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  }

  for (const cat of config.categories) {
    const dirPath = resolveSafeLibraryPath(slugify(cat.slug, 'categoria'));
    await fsp.mkdir(dirPath, { recursive: true });
  }

  return config;
}

async function saveLibraryConfig(config: LibraryConfig): Promise<void> {
  await fsp.mkdir(LIBRARY_DIR, { recursive: true });
  await fsp.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function classifyCategoryByRules(
  text: string,
  config: LibraryConfig,
  fallbackSlug?: string
): string {
  const haystack = normalizeText(text);
  let bestSlug = '';
  let bestScore = 0;

  for (const cat of config.categories) {
    let score = 0;
    for (const kw of cat.keywords) {
      const normalizedKw = normalizeText(kw.trim());
      if (normalizedKw && haystack.includes(normalizedKw)) {
        score += normalizedKw.length >= 4 ? 2 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestSlug = cat.slug;
    }
  }

  if (bestSlug) return bestSlug;

  if (fallbackSlug) {
    const matched = config.categories.find(
      (c) =>
        c.slug === slugify(fallbackSlug) ||
        normalizeText(c.name) === normalizeText(fallbackSlug)
    );
    if (matched) return matched.slug;
  }

  return config.categories[0]?.slug || 'tecnologia';
}

function detectPlatformFromUrl(rawUrl: string): string {
  const lower = rawUrl.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'X (Twitter)';
  if (lower.includes('reddit.com') || lower.includes('redd.it')) return 'Reddit';
  if (lower.includes('vimeo.com')) return 'Vimeo';
  if (lower.includes('archive.org')) return 'Acervo Aberto';
  return 'Web / Social';
}

function mapVideoTypeLabel(slug: VideoTypeFilter): string {
  const map: Record<VideoTypeFilter, string> = {
    todos: 'Vídeo Social',
    curto: 'Vídeo Curto / Reel',
    tutorial: 'Tutorial & Passo a Passo',
    clipe: 'Clipe & Corte',
    analise: 'Análise & Review',
    documentario: 'Documentário',
    viral: 'Em Alta / Viral',
  };
  return map[slug] || 'Vídeo Social';
}

function extractMetaTag(html: string, attrName: string, attrValue: string): string | undefined {
  const escaped = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patternA = new RegExp(
    `<meta[^>]*${attrName}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    'i'
  );
  const patternB = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${escaped}["'][^>]*>`,
    'i'
  );
  const m = html.match(patternA) || html.match(patternB);
  return m?.[1]?.replace(/&amp;/g, '&').trim();
}

async function extractMediaMetadataFromPage(pageUrl: string): Promise<{
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  directMediaUrl?: string;
}> {
  const res = await safeFetch(pageUrl, {
    headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  });

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.startsWith('video/')) {
    return {
      directMediaUrl: res.url || pageUrl,
    };
  }

  if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
    return {};
  }

  const reader = res.body?.getReader();
  let html = '';
  if (reader) {
    const decoder = new TextDecoder();
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (total >= MAX_HTML_BYTES) {
        await reader.cancel();
        break;
      }
    }
  } else {
    html = (await res.text()).slice(0, MAX_HTML_BYTES);
  }

  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title =
    extractMetaTag(html, 'property', 'og:title') ||
    extractMetaTag(html, 'name', 'twitter:title') ||
    titleTagMatch?.[1]?.trim();

  const description =
    extractMetaTag(html, 'property', 'og:description') ||
    extractMetaTag(html, 'name', 'description') ||
    extractMetaTag(html, 'name', 'twitter:description');

  const thumbnailUrl =
    extractMetaTag(html, 'property', 'og:image:secure_url') ||
    extractMetaTag(html, 'property', 'og:image') ||
    extractMetaTag(html, 'name', 'twitter:image');

  let directMediaUrl =
    extractMetaTag(html, 'property', 'og:video:secure_url') ||
    extractMetaTag(html, 'property', 'og:video:url') ||
    extractMetaTag(html, 'property', 'og:video') ||
    extractMetaTag(html, 'name', 'twitter:player:stream');

  if (!directMediaUrl) {
    const videoSrcMatch = html.match(/<video[^>]+src=["']([^"']+\.(?:mp4|webm|mov)[^"']*)["']/i);
    const sourceSrcMatch = html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|webm|mov)[^"']*)["']/i);
    directMediaUrl = videoSrcMatch?.[1] || sourceSrcMatch?.[1];
  }

  if (directMediaUrl) {
    try {
      directMediaUrl = new URL(directMediaUrl, pageUrl).toString();
    } catch {
      directMediaUrl = undefined;
    }
  }

  let resolvedThumb = thumbnailUrl;
  if (resolvedThumb) {
    try {
      resolvedThumb = new URL(resolvedThumb, pageUrl).toString();
    } catch {
      resolvedThumb = undefined;
    }
  }

  return {
    title,
    description,
    thumbnailUrl: resolvedThumb,
    directMediaUrl,
  };
}

async function downloadBinaryToFile(
  rawUrl: string,
  destPath: string,
  expectedKind: 'video' | 'image'
): Promise<{ sizeBytes: number; contentType: string }> {
  const res = await safeFetch(rawUrl, { timeoutMs: 30000 });
  if (!res.ok) {
    throw new Error(`Falha ao baixar mídia (HTTP ${res.status}).`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (expectedKind === 'video') {
    const looksLikeVideo =
      contentType.startsWith('video/') ||
      contentType.includes('octet-stream') ||
      rawUrl.toLowerCase().includes('.mp4') ||
      rawUrl.toLowerCase().includes('.webm') ||
      rawUrl.toLowerCase().includes('.mov');
    if (!looksLikeVideo || contentType.includes('text/html')) {
      throw new Error('A URL não retornou um fluxo de vídeo direto.');
    }
  } else if (expectedKind === 'image') {
    if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      throw new Error('A URL não retornou uma imagem válida.');
    }
  }

  const contentLengthHeader = Number(res.headers.get('content-length') || 0);
  if (contentLengthHeader > MAX_DOWNLOAD_BYTES) {
    throw new Error('Arquivo excede o limite de 120 MB.');
  }

  const tmpPath = `${destPath}.tmp-${crypto.randomBytes(4).toString('hex')}`;
  const writeStream = fs.createWriteStream(tmpPath);
  let totalBytes = 0;

  try {
    if (!res.body) {
      throw new Error('Corpo de resposta vazio.');
    }
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw new Error('Arquivo excede o limite de 120 MB durante o download.');
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.write(value, (err) => (err ? reject(err) : resolve()));
      });
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });

    if (totalBytes < 256) {
      throw new Error('Arquivo baixado está vazio ou corrompido.');
    }

    await fsp.rename(tmpPath, destPath);
    return { sizeBytes: totalBytes, contentType };
  } catch (err) {
    writeStream.destroy();
    await fsp.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

async function generateFfmpegThumbnail(mp4Path: string, jpgPath: string): Promise<boolean> {
  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-ss', '00:00:01', '-i', mp4Path, '-frames:v', '1', '-q:v', '3', jpgPath],
      { timeout: 12000 }
    );
    const stat = await fsp.stat(jpgPath);
    return stat.size > 0;
  } catch {
    return false;
  }
}

function buildOfflineHtmlPackage(item: {
  title: string;
  author: string;
  platform: string;
  videoType: string;
  duration: string;
  summary: string;
  postUrl: string;
  categoryName: string;
  savedAt: string;
  baseSlug: string;
}): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const safeHref =
    item.postUrl.startsWith('http://') || item.postUrl.startsWith('https://')
      ? item.postUrl
      : '#';

  const ytdlpCmd = `yt-dlp -o "${item.categoryName}/${item.baseSlug}.%(ext)s" "${safeHref}"`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(item.title)} — AcervoClip</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}
    .card{max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px}
    .meta{font-size:13px;color:#64748b;margin-bottom:12px}
    h1{font-size:22px;margin:0 0 12px}
    p{font-size:15px;line-height:1.6;color:#334155}
    .box{margin-top:20px;padding:14px;background:#f1f5f9;border-radius:8px;font-family:monospace;font-size:13px;word-break:break-all}
    a.btn{display:inline-block;margin-top:20px;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px}
  </style>
</head>
<body>
  <div class="card">
    <div class="meta">${esc(item.platform)} &middot; ${esc(item.videoType)} &middot; Pasta: ${esc(item.categoryName)} &middot; ${esc(item.duration)}</div>
    <h1>${esc(item.title)}</h1>
    <p><strong>Autor:</strong> ${esc(item.author)}</p>
    <p>${esc(item.summary)}</p>
    <a class="btn" href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer">Abrir Post Original</a>
    <div class="box">${esc(ytdlpCmd)}</div>
  </div>
</body>
</html>`;
}

async function searchArchiveOpenVideos(
  query: string,
  videoType: VideoTypeFilter
): Promise<SocialPostResult[]> {
  try {
    const cleanQ = query.replace(/["\\]/g, ' ').trim();
    const searchUrl = new URL('https://archive.org/advancedsearch.php');
    searchUrl.searchParams.set(
      'q',
      `(${cleanQ}) AND mediatype:(movies) AND format:(MPEG4 OR h.264)`
    );
    searchUrl.searchParams.append('fl[]', 'identifier');
    searchUrl.searchParams.append('fl[]', 'title');
    searchUrl.searchParams.append('fl[]', 'creator');
    searchUrl.searchParams.append('fl[]', 'description');
    searchUrl.searchParams.set('rows', '5');
    searchUrl.searchParams.set('page', '1');
    searchUrl.searchParams.set('output', 'json');

    const res = await safeFetch(searchUrl.toString(), { timeoutMs: 8000 });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      response?: {
        docs?: Array<{
          identifier?: string;
          title?: string | string[];
          creator?: string | string[];
          description?: string | string[];
        }>;
      };
    };

    const docs = data.response?.docs || [];
    const results: SocialPostResult[] = [];

    const metadataPromises = docs.slice(0, 4).map(async (doc) => {
      if (!doc.identifier) return null;
      try {
        const metaRes = await safeFetch(
          `https://archive.org/metadata/${encodeURIComponent(doc.identifier)}/files`,
          { timeoutMs: 6000 }
        );
        if (!metaRes.ok) return null;
        const metaJson = (await metaRes.json()) as {
          result?: Array<{
            name?: string;
            format?: string;
            size?: string;
            length?: string;
          }>;
        };
        const files = metaJson.result || [];
        const mp4 = files.find(
          (f) =>
            f.name &&
            f.name.toLowerCase().endsWith('.mp4') &&
            Number(f.size || 0) > 1024 &&
            Number(f.size || 0) < 60 * 1024 * 1024
        );
        if (!mp4 || !mp4.name) return null;

        const titleStr = Array.isArray(doc.title) ? doc.title[0] : doc.title || doc.identifier;
        const creatorStr = Array.isArray(doc.creator)
          ? doc.creator[0]
          : doc.creator || 'Acervo Público';
        const descRaw = Array.isArray(doc.description)
          ? doc.description[0]
          : doc.description || '';
        const cleanDesc = descRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);

        const sec = Math.round(Number(mp4.length || 0));
        const duration =
          sec > 0
            ? `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
            : 'MP4';

        return {
          id: `archive-${doc.identifier}`,
          title: String(titleStr),
          author: String(creatorStr),
          platform: 'Acervo Aberto',
          videoType: mapVideoTypeLabel(videoType),
          videoTypeSlug: videoType,
          duration,
          summary:
            cleanDesc ||
            'Vídeo em domínio público/licença aberta pronto para download direto em .MP4 e organização em pasta.',
          postUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
          directMediaUrl: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${mp4.name
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`,
          thumbnailUrl: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
          suggestedCategorySlug: 'educacao-e-tutoriais',
          tags: [query, 'mp4-direto'],
          hasDirectStream: true,
          sourceEngine: 'open-archive' as const,
        };
      } catch {
        return null;
      }
    });

    const resolved = await Promise.all(metadataPromises);
    for (const item of resolved) {
      if (item) results.push(item);
    }
    return results;
  } catch {
    return [];
  }
}

async function searchSocialWithGemini(
  query: string,
  platform: string,
  videoType: VideoTypeFilter,
  config: LibraryConfig
): Promise<{ results: SocialPostResult[]; warning?: string }> {
  if (!ai) {
    return {
      results: [],
      warning:
        'Chave GEMINI_API_KEY não configurada no servidor. Exibindo apenas vídeos do Acervo Aberto (.MP4).',
    };
  }

  const platformInstruction =
    platform === 'todas'
      ? 'YouTube, TikTok, Instagram Reels, X (Twitter), Reddit ou Vimeo'
      : platform.toUpperCase();

  const videoTypeMap: Record<VideoTypeFilter, string> = {
    todos: 'qualquer formato de vídeo interessante',
    curto: 'vídeos curtos verticais (Shorts, Reels, TikTok de até 60 segundos)',
    tutorial: 'tutoriais, guias passo a passo ou aulas práticas em vídeo',
    clipe: 'clipes curtos, cortes de podcasts ou destaques de lives',
    analise: 'análises detalhadas, reviews ou explicações visuais',
    documentario: 'mini-documentários, bastidores ou histórias aprofundadas',
    viral: 'posts em alta, tendências recentes ou vídeos com alto engajamento',
  };

  const categoryListText = config.categories
    .map((c) => `- "${c.slug}" (${c.name}): palavras-chave [${c.keywords.join(', ')}]`)
    .join('\n');

  const prompt = `Use Google Search to find 6 real, existing, interesting social media video posts about "${query}" on ${platformInstruction}.
Target video format: ${videoTypeMap[videoType]}.

Classify each post into one of the user's category folder slugs below (choose the most accurate slug):
${categoryListText}

Return ONLY a raw JSON array (no markdown code fence, no commentary) where each object has these exact keys:
[
  {
    "title": "Concise descriptive title in Portuguese",
    "author": "@handle or channel name",
    "platform": "YouTube | TikTok | Instagram | X | Reddit | Vimeo",
    "duration": "MM:SS or short estimate like 00:45",
    "summary": "1-2 sentences in Portuguese explaining why this video post is interesting",
    "postUrl": "Exact verified https URL from the search results",
    "suggestedCategorySlug": "one of the category slugs above",
    "tags": ["tag1", "tag2", "tag3"]
  }
]`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const rawText = (response.text || '').trim();
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { results: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title?: string;
      author?: string;
      platform?: string;
      duration?: string;
      summary?: string;
      postUrl?: string;
      suggestedCategorySlug?: string;
      tags?: string[];
    }>;

    const groundingChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundedUrls = groundingChunks
      .map((c) => c.web?.uri)
      .filter((u): u is string => Boolean(u && u.startsWith('http')));

    const normalized: SocialPostResult[] = [];
    for (let idx = 0; idx < parsed.length; idx++) {
      const item = parsed[idx];
      if (!item.title || !item.postUrl) continue;
      let cleanUrl = item.postUrl.trim();
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        if (groundedUrls[idx]) {
          cleanUrl = groundedUrls[idx];
        } else {
          continue;
        }
      }

      const detectedPlatform = item.platform || detectPlatformFromUrl(cleanUrl);
      const tags = Array.isArray(item.tags) ? item.tags.slice(0, 5) : [query];
      const matchedCategory = classifyCategoryByRules(
        `${item.title} ${item.summary || ''} ${tags.join(' ')}`,
        config,
        item.suggestedCategorySlug
      );

      // Extract YouTube thumbnail safely if YouTube URL
      let thumbnailUrl: string | undefined;
      try {
        const u = new URL(cleanUrl);
        if (u.hostname.includes('youtube.com')) {
          const vid = u.searchParams.get('v') || u.pathname.split('/shorts/')[1]?.split('/')[0];
          if (vid && /^[a-zA-Z0-9_-]{6,20}$/.test(vid)) {
            thumbnailUrl = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
          }
        } else if (u.hostname === 'youtu.be') {
          const vid = u.pathname.replace('/', '').split('/')[0];
          if (vid && /^[a-zA-Z0-9_-]{6,20}$/.test(vid)) {
            thumbnailUrl = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
          }
        }
      } catch {
        // ignore invalid URL parse
      }

      normalized.push({
        id: `social-${crypto.createHash('md5').update(cleanUrl).digest('hex').slice(0, 10)}`,
        title: item.title.trim(),
        author: (item.author || 'Criador').trim(),
        platform: detectedPlatform,
        videoType: mapVideoTypeLabel(videoType),
        videoTypeSlug: videoType,
        duration: (item.duration || 'Vídeo').trim(),
        summary: (item.summary || '').trim(),
        postUrl: cleanUrl,
        thumbnailUrl,
        suggestedCategorySlug: matchedCategory,
        tags,
        hasDirectStream: false,
        sourceEngine: 'social-search',
      });
    }

    return { results: normalized };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      results: [],
      warning: `Busca via IA indisponível no momento (${msg}).`,
    };
  }
}

async function scanLibrarySnapshot(): Promise<LibrarySnapshot> {
  const config = await ensureLibraryInitialized();
  const categoriesMap = new Map<string, CategorySummary>();

  for (const cat of config.categories) {
    categoriesMap.set(cat.slug, {
      ...cat,
      itemCount: 0,
      videoCount: 0,
      totalBytes: 0,
    });
  }

  const items: SavedMediaItem[] = [];

  for (const cat of config.categories) {
    const folderPath = resolveSafeLibraryPath(cat.slug);
    let files: string[] = [];
    try {
      files = await fsp.readdir(folderPath);
    } catch {
      continue;
    }

    const metaFiles = files.filter((f) => f.endsWith('.meta.json'));
    const accountedFiles = new Set<string>();

    for (const metaFile of metaFiles) {
      accountedFiles.add(metaFile);
      try {
        const metaPath = resolveSafeLibraryPath(cat.slug, metaFile);
        const rawMeta = await fsp.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(rawMeta) as Partial<SavedMediaItem>;
        const baseSlug = meta.baseSlug || metaFile.replace(/\.meta\.json$/, '');

        const videoFile = files.find(
          (f) =>
            f.startsWith(`${baseSlug}.`) &&
            /\.(mp4|webm|mov|mkv)$/i.test(f)
        );
        const thumbFile = files.find(
          (f) =>
            f.startsWith(`${baseSlug}.`) && /\.(jpg|jpeg|png|webp)$/i.test(f)
        );
        const htmlFile = files.find((f) => f === `${baseSlug}.html`);

        let videoSizeBytes = 0;
        if (videoFile) {
          accountedFiles.add(videoFile);
          const stat = await fsp.stat(resolveSafeLibraryPath(cat.slug, videoFile));
          videoSizeBytes = stat.size;
        }
        if (thumbFile) {
          accountedFiles.add(thumbFile);
          const stat = await fsp.stat(resolveSafeLibraryPath(cat.slug, thumbFile));
          videoSizeBytes += stat.size;
        }
        if (htmlFile) {
          accountedFiles.add(htmlFile);
        }

        const item: SavedMediaItem = {
          id: meta.id || baseSlug,
          baseSlug,
          title: meta.title || baseSlug,
          author: meta.author || 'Criador',
          platform: meta.platform || 'Web',
          videoType: meta.videoType || 'Vídeo Social',
          duration: meta.duration || '—',
          summary: meta.summary || '',
          postUrl: meta.postUrl || '',
          categorySlug: cat.slug,
          categoryName: cat.name,
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          savedAt: meta.savedAt || new Date().toISOString(),
          hasVideoFile: Boolean(videoFile),
          videoFilename: videoFile,
          videoSizeBytes,
          hasThumbnail: Boolean(thumbFile),
          thumbnailFilename: thumbFile,
          htmlFilename: htmlFile,
          downloadMode:
            meta.downloadMode || (videoFile ? 'mp4-direct' : 'package-saved'),
        };

        items.push(item);

        const summary = categoriesMap.get(cat.slug);
        if (summary) {
          summary.itemCount += 1;
          if (item.hasVideoFile) summary.videoCount += 1;
          summary.totalBytes += videoSizeBytes;
        }
      } catch {
        // skip corrupted meta
      }
    }

    // Also include standalone video files manually placed in the folder
    for (const file of files) {
      if (accountedFiles.has(file)) continue;
      if (/\.(mp4|webm|mov|mkv)$/i.test(file)) {
        const stat = await fsp.stat(resolveSafeLibraryPath(cat.slug, file));
        const baseSlug = file.replace(/\.[^.]+$/, '');
        const item: SavedMediaItem = {
          id: `file-${cat.slug}-${baseSlug}`,
          baseSlug,
          title: baseSlug.replace(/-/g, ' '),
          author: 'Arquivo Local',
          platform: 'Upload Local',
          videoType: 'Vídeo Salvo',
          duration: 'MP4',
          summary: 'Arquivo de vídeo salvo diretamente nesta pasta de categoria.',
          postUrl: '',
          categorySlug: cat.slug,
          categoryName: cat.name,
          tags: [cat.name],
          savedAt: stat.mtime.toISOString(),
          hasVideoFile: true,
          videoFilename: file,
          videoSizeBytes: stat.size,
          hasThumbnail: false,
          downloadMode: 'local-upload',
        };
        items.push(item);
        const summary = categoriesMap.get(cat.slug);
        if (summary) {
          summary.itemCount += 1;
          summary.videoCount += 1;
          summary.totalBytes += stat.size;
        }
      }
    }
  }

  items.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

  const categories = Array.from(categoriesMap.values());
  const totalBytes = categories.reduce((acc, c) => acc + c.totalBytes, 0);
  const totalVideos = categories.reduce((acc, c) => acc + c.videoCount, 0);

  return {
    config,
    categories,
    items,
    totalItems: items.length,
    totalVideos,
    totalBytes,
  };
}

async function startServer() {
  await ensureLibraryInitialized();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Search social posts + open archive videos
  app.post('/api/search', async (req, res) => {
    try {
      const query = String(req.body?.query || '').trim();
      const platform = String(req.body?.platform || 'todas').toLowerCase();
      const videoType = String(req.body?.videoType || 'todos') as VideoTypeFilter;

      if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Informe um tema com pelo menos 2 caracteres.' });
      }

      const config = await ensureLibraryInitialized();

      const tasks: [
        Promise<{ results: SocialPostResult[]; warning?: string }>,
        Promise<SocialPostResult[]>
      ] = [
        platform === 'archive'
          ? Promise.resolve({ results: [] })
          : searchSocialWithGemini(query, platform, videoType, config),
        platform === 'todas' || platform === 'archive'
          ? searchArchiveOpenVideos(query, videoType)
          : Promise.resolve([]),
      ];

      const [socialResp, archiveResults] = await Promise.all(tasks);

      // Re-classify archive results with user rules
      const classifiedArchive = archiveResults.map((item) => ({
        ...item,
        suggestedCategorySlug: classifyCategoryByRules(
          `${item.title} ${item.summary} ${query}`,
          config,
          item.suggestedCategorySlug
        ),
      }));

      const combined = [...classifiedArchive, ...socialResp.results];

      if (combined.length === 0 && socialResp.warning) {
        return res.status(502).json({
          error: socialResp.warning,
          results: [],
        });
      }

      return res.json({
        results: combined,
        warning: socialResp.warning,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar vídeos.';
      return res.status(500).json({ error: msg });
    }
  });

  // Inspect a pasted post URL or direct video URL
  app.post('/api/inspect-url', async (req, res) => {
    try {
      const rawUrl = String(req.body?.url || '').trim();
      const videoType = (String(req.body?.videoType || 'todos') || 'todos') as VideoTypeFilter;
      if (!rawUrl) {
        return res.status(400).json({ error: 'Cole uma URL válida.' });
      }

      const config = await ensureLibraryInitialized();
      const meta = await extractMediaMetadataFromPage(rawUrl);
      const platform = detectPlatformFromUrl(rawUrl);
      const title = meta.title || `Post de ${platform}`;
      const summary =
        meta.description ||
        'Link inspecionado diretamente para download e organização em pasta.';

      let suggestedCategorySlug = classifyCategoryByRules(`${title} ${summary}`, config);

      if (ai && config.aiAutoCategorize) {
        try {
          const catSlugs = config.categories.map((c) => `${c.slug} (${c.name})`).join(', ');
          const aiResp = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Choose the single best category slug from [${catSlugs}] for this post: Title: "${title}". Description: "${summary}". Reply with ONLY the slug.`,
          });
          const candidate = slugify((aiResp.text || '').trim());
          if (config.categories.some((c) => c.slug === candidate)) {
            suggestedCategorySlug = candidate;
          }
        } catch {
          // fallback to rule-based classification
        }
      }

      const post: SocialPostResult = {
        id: `url-${crypto.createHash('md5').update(rawUrl).digest('hex').slice(0, 10)}`,
        title,
        author: new URL(rawUrl).hostname.replace(/^www\./, ''),
        platform,
        videoType: mapVideoTypeLabel(videoType),
        videoTypeSlug: videoType,
        duration: meta.directMediaUrl ? 'MP4' : 'Link',
        summary,
        postUrl: rawUrl,
        directMediaUrl: meta.directMediaUrl,
        thumbnailUrl: meta.thumbnailUrl,
        suggestedCategorySlug,
        tags: [platform.toLowerCase()],
        hasDirectStream: Boolean(meta.directMediaUrl),
        sourceEngine: 'url-inspect',
      };

      return res.json({ post });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível inspecionar esta URL.';
      return res.status(400).json({ error: msg });
    }
  });

  // Download video/package and organize automatically into category folder
  app.post('/api/download', async (req, res) => {
    try {
      const post = req.body?.post as SocialPostResult | undefined;
      const requestedCategory = req.body?.categorySlug
        ? slugify(String(req.body.categorySlug))
        : undefined;

      if (!post || !post.title || !post.postUrl) {
        return res.status(400).json({ error: 'Dados do post inválidos para download.' });
      }

      const config = await ensureLibraryInitialized();
      const chosenSlug = requestedCategory
        ? requestedCategory
        : classifyCategoryByRules(
            `${post.title} ${post.summary} ${(post.tags || []).join(' ')}`,
            config,
            post.suggestedCategorySlug
          );

      let category = config.categories.find((c) => c.slug === chosenSlug);
      if (!category) {
        category = config.categories[0];
      }

      const folderPath = resolveSafeLibraryPath(category.slug);
      await fsp.mkdir(folderPath, { recursive: true });

      const uniqueSuffix = crypto.randomBytes(2).toString('hex');
      const baseSlug = `${slugify(post.title, 'video')}-${uniqueSuffix}`;

      let videoUrl = post.directMediaUrl;
      let extractedThumb = post.thumbnailUrl;

      if (!videoUrl && post.postUrl) {
        try {
          const pageMeta = await extractMediaMetadataFromPage(post.postUrl);
          if (pageMeta.directMediaUrl) videoUrl = pageMeta.directMediaUrl;
          if (!extractedThumb && pageMeta.thumbnailUrl) extractedThumb = pageMeta.thumbnailUrl;
        } catch {
          // platform may block automated scraping; continue saving organized package
        }
      }

      let hasVideoFile = false;
      let videoFilename: string | undefined;
      let videoSizeBytes = 0;

      if (videoUrl) {
        try {
          const ext = videoUrl.toLowerCase().includes('.webm') ? 'webm' : 'mp4';
          const candidateFilename = `${baseSlug}.${ext}`;
          const mp4Dest = resolveSafeLibraryPath(category.slug, candidateFilename);
          const dlResult = await downloadBinaryToFile(videoUrl, mp4Dest, 'video');
          hasVideoFile = true;
          videoFilename = candidateFilename;
          videoSizeBytes = dlResult.sizeBytes;
        } catch {
          hasVideoFile = false;
        }
      }

      let hasThumbnail = false;
      let thumbnailFilename: string | undefined;
      if (extractedThumb) {
        try {
          const jpgCandidate = `${baseSlug}.jpg`;
          const jpgDest = resolveSafeLibraryPath(category.slug, jpgCandidate);
          const thumbDl = await downloadBinaryToFile(extractedThumb, jpgDest, 'image');
          hasThumbnail = true;
          thumbnailFilename = jpgCandidate;
          videoSizeBytes += thumbDl.sizeBytes;
        } catch {
          hasThumbnail = false;
        }
      }

      if (hasVideoFile && videoFilename && !hasThumbnail) {
        const jpgCandidate = `${baseSlug}.jpg`;
        const mp4Path = resolveSafeLibraryPath(category.slug, videoFilename);
        const jpgDest = resolveSafeLibraryPath(category.slug, jpgCandidate);
        const ok = await generateFfmpegThumbnail(mp4Path, jpgDest);
        if (ok) {
          hasThumbnail = true;
          thumbnailFilename = jpgCandidate;
          const st = await fsp.stat(jpgDest);
          videoSizeBytes += st.size;
        }
      }

      const savedAt = new Date().toISOString();
      let htmlFilename: string | undefined;

      if (!hasVideoFile) {
        htmlFilename = `${baseSlug}.html`;
        const htmlContent = buildOfflineHtmlPackage({
          title: post.title,
          author: post.author,
          platform: post.platform,
          videoType: post.videoType,
          duration: post.duration,
          summary: post.summary,
          postUrl: post.postUrl,
          categoryName: category.name,
          savedAt,
          baseSlug,
        });
        await fsp.writeFile(
          resolveSafeLibraryPath(category.slug, htmlFilename),
          htmlContent,
          'utf-8'
        );
      }

      const savedItem: SavedMediaItem = {
        id: `${category.slug}-${baseSlug}`,
        baseSlug,
        title: post.title,
        author: post.author,
        platform: post.platform,
        videoType: post.videoType,
        duration: post.duration,
        summary: post.summary,
        postUrl: post.postUrl,
        categorySlug: category.slug,
        categoryName: category.name,
        tags: post.tags || [],
        savedAt,
        hasVideoFile,
        videoFilename,
        videoSizeBytes,
        hasThumbnail,
        thumbnailFilename,
        htmlFilename,
        downloadMode: hasVideoFile ? 'mp4-direct' : 'package-saved',
      };

      await fsp.writeFile(
        resolveSafeLibraryPath(category.slug, `${baseSlug}.meta.json`),
        JSON.stringify(savedItem, null, 2),
        'utf-8'
      );

      return res.json({
        savedItem,
        message: hasVideoFile
          ? `Vídeo .MP4 baixado e salvo em "${category.name}".`
          : `Post organizado na pasta "${category.name}" (plataforma exige download manual ou anexo .MP4).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar arquivo na pasta.';
      return res.status(500).json({ error: msg });
    }
  });

  // Upload a local video file (.mp4/.webm/.mov) directly into a category folder or attach to an existing saved item
  app.post(
    '/api/library/upload',
    express.raw({ type: ['video/*', 'application/octet-stream'], limit: '120mb' }),
    async (req, res) => {
      try {
        const categorySlug = slugify(String(req.headers['x-category-slug'] || 'tecnologia'));
        let rawFilename = String(req.headers['x-filename'] || 'video.mp4');
        try {
          rawFilename = decodeURIComponent(rawFilename);
        } catch {
          // keep original if not URI-encoded
        }
        const attachBaseSlug = req.headers['x-base-slug']
          ? slugify(String(req.headers['x-base-slug']))
          : undefined;

        if (!Buffer.isBuffer(req.body) || req.body.byteLength < 256) {
          return res.status(400).json({ error: 'Arquivo de vídeo inválido ou vazio.' });
        }

        const config = await ensureLibraryInitialized();
        const category = config.categories.find((c) => c.slug === categorySlug);
        if (!category) {
          return res.status(404).json({ error: 'Pasta de categoria não encontrada.' });
        }

        const extMatch = rawFilename.toLowerCase().match(/\.(mp4|webm|mov)$/);
        const ext = extMatch ? extMatch[1] : 'mp4';

        const cleanTitle = rawFilename.replace(/\.[^.]+$/, '');
        const baseSlug =
          attachBaseSlug || `${slugify(cleanTitle, 'video')}-${crypto.randomBytes(2).toString('hex')}`;
        const videoFilename = `${baseSlug}.${ext}`;
        const videoDest = resolveSafeLibraryPath(category.slug, videoFilename);

        await fsp.writeFile(videoDest, req.body);
        let totalSize = req.body.byteLength;

        const thumbFilename = `${baseSlug}.jpg`;
        const thumbDest = resolveSafeLibraryPath(category.slug, thumbFilename);
        const hasThumb = await generateFfmpegThumbnail(videoDest, thumbDest);
        if (hasThumb) {
          const st = await fsp.stat(thumbDest);
          totalSize += st.size;
        }

        const metaPath = resolveSafeLibraryPath(category.slug, `${baseSlug}.meta.json`);
        let savedItem: SavedMediaItem;
        try {
          const existing = JSON.parse(await fsp.readFile(metaPath, 'utf-8')) as SavedMediaItem;
          savedItem = {
            ...existing,
            hasVideoFile: true,
            videoFilename,
            videoSizeBytes: totalSize,
            hasThumbnail: existing.hasThumbnail || hasThumb,
            thumbnailFilename: existing.thumbnailFilename || (hasThumb ? thumbFilename : undefined),
            downloadMode: 'local-upload',
          };
        } catch {
          savedItem = {
            id: `${category.slug}-${baseSlug}`,
            baseSlug,
            title: cleanTitle || baseSlug,
            author: 'Upload Local',
            platform: 'Arquivo Próprio',
            videoType: 'Vídeo Salvo',
            duration: ext.toUpperCase(),
            summary: `Arquivo enviado diretamente para a pasta ${category.name}.`,
            postUrl: '',
            categorySlug: category.slug,
            categoryName: category.name,
            tags: [category.name],
            savedAt: new Date().toISOString(),
            hasVideoFile: true,
            videoFilename,
            videoSizeBytes: totalSize,
            hasThumbnail: hasThumb,
            thumbnailFilename: hasThumb ? thumbFilename : undefined,
            downloadMode: 'local-upload',
          };
        }

        await fsp.writeFile(metaPath, JSON.stringify(savedItem, null, 2), 'utf-8');
        return res.json({ savedItem });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao enviar vídeo.';
        return res.status(500).json({ error: msg });
      }
    }
  );

  // Get library snapshot (categories + items)
  app.get('/api/library', async (_req, res) => {
    try {
      const snapshot = await scanLibrarySnapshot();
      return res.json(snapshot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao listar biblioteca.';
      return res.status(500).json({ error: msg });
    }
  });

  // Create new category folder
  app.post('/api/categories', async (req, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const keywordsRaw = req.body?.keywords;
      if (!name || name.length < 2) {
        return res.status(400).json({ error: 'Informe um nome válido para a pasta.' });
      }

      const config = await ensureLibraryInitialized();
      const slug = slugify(name, 'pasta');
      if (config.categories.some((c) => c.slug === slug)) {
        return res.status(409).json({ error: 'Já existe uma pasta com esse nome.' });
      }

      const keywords = Array.isArray(keywordsRaw)
        ? keywordsRaw.map((k) => String(k).trim()).filter(Boolean)
        : String(keywordsRaw || '')
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean);

      const newCat: CategoryConfig = {
        slug,
        name,
        keywords,
        createdAt: new Date().toISOString(),
      };

      await fsp.mkdir(resolveSafeLibraryPath(slug), { recursive: true });
      config.categories.push(newCat);
      await saveLibraryConfig(config);

      return res.json({ category: newCat });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar pasta.';
      return res.status(500).json({ error: msg });
    }
  });

  // Update category keywords / name / global AI setting
  app.patch('/api/categories/:slug', async (req, res) => {
    try {
      const slug = slugify(req.params.slug);
      const config = await ensureLibraryInitialized();
      const cat = config.categories.find((c) => c.slug === slug);
      if (!cat) {
        return res.status(404).json({ error: 'Pasta não encontrada.' });
      }

      if (typeof req.body?.name === 'string' && req.body.name.trim().length >= 2) {
        cat.name = req.body.name.trim();
      }
      if (req.body?.keywords !== undefined) {
        cat.keywords = Array.isArray(req.body.keywords)
          ? req.body.keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
          : String(req.body.keywords)
              .split(',')
              .map((k) => k.trim())
              .filter(Boolean);
      }
      if (typeof req.body?.aiAutoCategorize === 'boolean') {
        config.aiAutoCategorize = req.body.aiAutoCategorize;
      }

      await saveLibraryConfig(config);
      return res.json({ category: cat, config });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar regras da pasta.';
      return res.status(500).json({ error: msg });
    }
  });

  // Delete empty category folder
  app.delete('/api/categories/:slug', async (req, res) => {
    try {
      const slug = slugify(req.params.slug);
      const config = await ensureLibraryInitialized();
      if (config.categories.length <= 1) {
        return res.status(400).json({ error: 'É necessário manter ao menos uma pasta.' });
      }

      const dirPath = resolveSafeLibraryPath(slug);
      const files = await fsp.readdir(dirPath).catch(() => []);
      if (files.length > 0) {
        return res.status(400).json({
          error: 'Mova ou exclua os arquivos desta pasta antes de removê-la.',
        });
      }

      await fsp.rmdir(dirPath).catch(() => {});
      config.categories = config.categories.filter((c) => c.slug !== slug);
      await saveLibraryConfig(config);
      return res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover pasta.';
      return res.status(500).json({ error: msg });
    }
  });

  // Move saved item between category folders physically on disk
  app.post('/api/library/move', async (req, res) => {
    try {
      const fromSlug = slugify(String(req.body?.fromCategory || ''));
      const toSlug = slugify(String(req.body?.toCategory || ''));
      const baseSlug = slugify(String(req.body?.baseSlug || ''));

      if (!fromSlug || !toSlug || !baseSlug || fromSlug === toSlug) {
        return res.status(400).json({ error: 'Parâmetros de movimentação inválidos.' });
      }

      const config = await ensureLibraryInitialized();
      const targetCat = config.categories.find((c) => c.slug === toSlug);
      if (!targetCat) {
        return res.status(404).json({ error: 'Pasta de destino não encontrada.' });
      }

      const fromDir = resolveSafeLibraryPath(fromSlug);
      const toDir = resolveSafeLibraryPath(toSlug);
      await fsp.mkdir(toDir, { recursive: true });

      const files = await fsp.readdir(fromDir);
      const matching = files.filter((f) => f.startsWith(`${baseSlug}.`));
      if (matching.length === 0) {
        return res.status(404).json({ error: 'Arquivo não encontrado na pasta de origem.' });
      }

      for (const file of matching) {
        const src = resolveSafeLibraryPath(fromSlug, file);
        const dst = resolveSafeLibraryPath(toSlug, file);
        await fsp.rename(src, dst);
      }

      const movedMetaPath = resolveSafeLibraryPath(toSlug, `${baseSlug}.meta.json`);
      try {
        const meta = JSON.parse(await fsp.readFile(movedMetaPath, 'utf-8')) as SavedMediaItem;
        meta.categorySlug = targetCat.slug;
        meta.categoryName = targetCat.name;
        meta.id = `${targetCat.slug}-${baseSlug}`;
        await fsp.writeFile(movedMetaPath, JSON.stringify(meta, null, 2), 'utf-8');
      } catch {
        // standalone file without meta
      }

      return res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao mover item.';
      return res.status(500).json({ error: msg });
    }
  });

  // Delete saved item and its files
  app.delete('/api/library/item', async (req, res) => {
    try {
      const categorySlug = slugify(String(req.query.category || ''));
      const baseSlug = slugify(String(req.query.baseSlug || ''));
      if (!categorySlug || !baseSlug) {
        return res.status(400).json({ error: 'Identificadores inválidos.' });
      }

      const dirPath = resolveSafeLibraryPath(categorySlug);
      const files = await fsp.readdir(dirPath);
      const toDelete = files.filter((f) => f.startsWith(`${baseSlug}.`));
      for (const file of toDelete) {
        await fsp.unlink(resolveSafeLibraryPath(categorySlug, file));
      }

      return res.json({ ok: true, deletedCount: toDelete.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir arquivo.';
      return res.status(500).json({ error: msg });
    }
  });

  // Stream or download an individual saved file securely
  app.get('/api/library/file', async (req, res) => {
    try {
      const categorySlug = slugify(String(req.query.category || ''));
      const filename = path.basename(String(req.query.file || ''));
      const forceDownload = req.query.download === '1';

      if (!categorySlug || !filename || filename === '_config.json') {
        return res.status(400).json({ error: 'Arquivo inválido.' });
      }

      const filePath = resolveSafeLibraryPath(categorySlug, filename);
      await fsp.access(filePath);

      if (forceDownload) {
        return res.download(filePath, filename);
      }
      return res.sendFile(filePath);
    } catch {
      return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }
  });

  // Export entire library or single category folder as .ZIP preserving folder structure
  app.get('/api/library/export-zip', async (req, res) => {
    try {
      const categoryParam = req.query.category ? slugify(String(req.query.category)) : null;
      const config = await ensureLibraryInitialized();

      const zipFilename = categoryParam
        ? `acervoclip-${categoryParam}.zip`
        : 'acervoclip-biblioteca-completa.zip';

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', (err: Error) => {
        if (!res.headersSent) {
          res.status(500).json({ error: err.message });
        }
      });
      archive.pipe(res);

      const targetCategories = categoryParam
        ? config.categories.filter((c) => c.slug === categoryParam)
        : config.categories;

      for (const cat of targetCategories) {
        const folderPath = resolveSafeLibraryPath(cat.slug);
        const safeFolderLabel = cat.name.replace(/[\\/:*?"<>|]/g, '-');
        try {
          const files = await fsp.readdir(folderPath);
          for (const file of files) {
            if (file.endsWith('.tmp')) continue;
            const fullPath = resolveSafeLibraryPath(cat.slug, file);
            archive.file(fullPath, { name: `${safeFolderLabel}/${file}` });
          }
        } catch {
          // ignore missing dir
        }
      }

      await archive.finalize();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar arquivo ZIP.';
      if (!res.headersSent) {
        return res.status(500).json({ error: msg });
      }
    }
  });

  interface ProviderToken {
    accessToken: string;
    refreshToken?: string;
    username: string;
    avatarUrl?: string;
    connectedAt: string;
  }

  interface OAuthSession {
    youtube?: ProviderToken;
    reddit?: ProviderToken;
  }

  const oauthSessions = new Map<string, OAuthSession>();
  const oauthPendingStates = new Map<
    string,
    { sid: string; provider: OAuthProviderId; expiresAt: number }
  >();

  function getAppBaseUrl(req: express.Request): string {
    const envUrl = (process.env.APP_URL || '').trim();
    if (envUrl && envUrl.startsWith('http') && envUrl !== 'MY_APP_URL') {
      return envUrl.replace(/\/+$/, '');
    }
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000').split(',')[0].trim();
    return `${proto}://${host}`;
  }

  function parseCookies(req: express.Request): Record<string, string> {
    const header = req.headers.cookie || '';
    const out: Record<string, string> = {};
    for (const part of header.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
    return out;
  }

  function getOrCreateSessionId(req: express.Request, res: express.Response): string {
    const cookies = parseCookies(req);
    const existing = cookies.acervoclip_sid;
    if (existing && /^[a-f0-9]{64}$/.test(existing)) {
      if (!oauthSessions.has(existing)) {
        oauthSessions.set(existing, {});
      }
      return existing;
    }
    const sid = crypto.randomBytes(32).toString('hex');
    oauthSessions.set(sid, {});
    res.append(
      'Set-Cookie',
      `acervoclip_sid=${sid}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=None; Partitioned`
    );
    return sid;
  }

  function renderOAuthPopupResult(
    res: express.Response,
    payload: { type: 'OAUTH_AUTH_SUCCESS' | 'OAUTH_AUTH_ERROR'; provider: OAuthProviderId }
  ) {
    const safePayload = JSON.stringify(payload);
    const label =
      payload.type === 'OAUTH_AUTH_SUCCESS'
        ? 'Autenticação concluída. Esta janela será fechada automaticamente.'
        : 'Não foi possível concluir a autenticação. Feche esta janela e tente novamente.';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><title>Conexão Social — AcervoClip</title></head>
  <body style="font-family:system-ui,sans-serif;padding:32px;color:#0f172a;background:#f8fafc;">
    <p>${label}</p>
    <script>
      (function () {
        var msg = ${safePayload};
        if (window.opener) {
          window.opener.postMessage(msg, '*');
          window.close();
        } else {
          window.location.href = '/';
        }
      })();
    </script>
  </body>
</html>`);
  }

  function parseIsoDuration(iso: string | undefined): string {
    if (!iso) return 'Vídeo';
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 'Vídeo';
    const h = Number(m[1] || 0);
    const min = Number(m[2] || 0);
    const sec = Number(m[3] || 0);
    if (h > 0) {
      return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  app.set('trust proxy', 1);

  // Get OAuth connection status & exact callback URLs
  app.get('/api/auth/status', (req, res) => {
    const cookies = parseCookies(req);
    const sid = cookies.acervoclip_sid;
    const session = sid ? oauthSessions.get(sid) : undefined;
    const appBaseUrl = getAppBaseUrl(req);

    const payload: SocialAuthStatusResponse = {
      appBaseUrl,
      providers: [
        {
          provider: 'youtube',
          label: 'YouTube (Google)',
          configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
          connected: Boolean(session?.youtube?.accessToken),
          username: session?.youtube?.username,
          avatarUrl: session?.youtube?.avatarUrl,
          callbackUrl: `${appBaseUrl}/auth/youtube/callback`,
        },
        {
          provider: 'reddit',
          label: 'Reddit',
          configured: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
          connected: Boolean(session?.reddit?.accessToken),
          username: session?.reddit?.username,
          avatarUrl: session?.reddit?.avatarUrl,
          callbackUrl: `${appBaseUrl}/auth/reddit/callback`,
        },
      ],
    };

    return res.json(payload);
  });

  // Start YouTube OAuth (returns direct Google provider authorization URL for popup)
  app.get('/api/auth/youtube/url', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas variáveis de ambiente para conectar o YouTube.',
      });
    }

    const sid = getOrCreateSessionId(req, res);
    const state = crypto.randomBytes(24).toString('hex');
    oauthPendingStates.set(state, {
      sid,
      provider: 'youtube',
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const redirectUri = `${getAppBaseUrl(req)}/auth/youtube/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return res.json({
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  });

  // YouTube OAuth callback
  app.get(['/auth/youtube/callback', '/auth/youtube/callback/'], async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const pending = oauthPendingStates.get(state);
    oauthPendingStates.delete(state);

    if (!code || !pending || pending.provider !== 'youtube' || pending.expiresAt < Date.now()) {
      return renderOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'youtube' });
    }

    try {
      const redirectUri = `${getAppBaseUrl(req)}/auth/youtube/callback`;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        return renderOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'youtube' });
      }
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
      };
      if (!tokenData.access_token) {
        return renderOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'youtube' });
      }

      let username = 'Conta Google';
      let avatarUrl: string | undefined;
      try {
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (profileRes.ok) {
          const profile = (await profileRes.json()) as { name?: string; picture?: string };
          if (profile.name) username = profile.name;
          if (profile.picture) avatarUrl = profile.picture;
        }
      } catch {
        // optional profile metadata
      }

      const session = oauthSessions.get(pending.sid) || {};
      session.youtube = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        username,
        avatarUrl,
        connectedAt: new Date().toISOString(),
      };
      oauthSessions.set(pending.sid, session);

      res.append(
        'Set-Cookie',
        `acervoclip_sid=${pending.sid}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=None; Partitioned`
      );
      return renderOAuthPopupResult(res, { type: 'OAUTH_AUTH_SUCCESS', provider: 'youtube' });
    } catch {
      return renderOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'youtube' });
    }
  });

  // Start Reddit OAuth (returns direct Reddit provider authorization URL for popup)
  app.get('/api/auth/reddit/url', (req, res) => {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'Configure REDDIT_CLIENT_ID e REDDIT_CLIENT_SECRET nas variáveis de ambiente para conectar o Reddit.',
      });
    }

    const sid = getOrCreateSessionId(req, res);
    const state = crypto.randomBytes(24).toString('hex');
    oauthPendingStates.set(state, {
      sid,
      provider: 'reddit',
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const redirectUri = `${getAppBaseUrl(req)}/auth/reddit/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      state,
      redirect_uri: redirectUri,
      duration: 'permanent',
      scope: 'identity read history mysubreddits',
    });

    return res.json({
      url: `https://www.reddit.com/api/v1/authorize?${params.toString()}`,
    });
  });

  // Reddit OAuth callback
  app.get(['/auth/reddit/callback', '/auth/reddit/callback/'], async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const pending = oauthPendingStates.get(state);
    oauthPendingStates.delete(state);

    if (!code || !pending || pending.provider !== 'reddit' || pending.expiresAt < Date.now()) {
      return renderOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'reddit' });
    }

    try {
      const redirectUri = `${getAppBaseUrl(req)}/auth/reddit/callback`;
      const basicAuth = Buffer.from(
        `${process.env.REDDIT_CLIENT_ID!}:${process.env.REDDIT_CLIENT_SECRET!}`
      ).toString('base64');

      const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'AcervoClip/1.0',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        return renderOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'reddit' });
      }
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
      };
      if (!tokenData.access_token) {
        return renderOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'reddit' });
      }

      let username = 'Usuário Reddit';
      let avatarUrl: string | undefined;
      try {
        const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'User-Agent': 'AcervoClip/1.0',
          },
        });
        if (meRes.ok) {
          const me = (await meRes.json()) as { name?: string; icon_img?: string };
          if (me.name) username = me.name;
          if (me.icon_img) avatarUrl = me.icon_img.split('?')[0];
        }
      } catch {
        // optional profile metadata
      }

      const session = oauthSessions.get(pending.sid) || {};
      session.reddit = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        username,
        avatarUrl,
        connectedAt: new Date().toISOString(),
      };
      oauthSessions.set(pending.sid, session);

      res.append(
        'Set-Cookie',
        `acervoclip_sid=${pending.sid}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=None; Partitioned`
      );
      return renderOAuthPopupResult(res, { type: 'OAUTH_AUTH_SUCCESS', provider: 'reddit' });
    } catch {
      return renderOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'reddit' });
    }
  });

  // Disconnect social provider (with Origin / custom-header CSRF verification)
  app.post('/api/auth/logout', (req, res) => {
    const origin = req.headers.origin;
    const hostHeader = String(req.headers['x-forwarded-host'] || req.get('host') || '');
    const customHdr = req.headers['x-requested-with'];
    if (origin && hostHeader) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== hostHeader && !customHdr) {
          return res.status(403).json({ error: 'Origem não autorizada.' });
        }
      } catch {
        return res.status(403).json({ error: 'Origem inválida.' });
      }
    }

    const provider = String(req.body?.provider || '') as OAuthProviderId;
    const cookies = parseCookies(req);
    const sid = cookies.acervoclip_sid;
    if (sid && oauthSessions.has(sid)) {
      const session = oauthSessions.get(sid)!;
      if (provider === 'youtube') delete session.youtube;
      if (provider === 'reddit') delete session.reddit;
    }
    return res.json({ ok: true });
  });

  // Fetch liked videos from connected YouTube account
  app.get('/api/auth/youtube/saved', async (req, res) => {
    const cookies = parseCookies(req);
    const sid = cookies.acervoclip_sid;
    const token = sid ? oauthSessions.get(sid)?.youtube?.accessToken : undefined;
    if (!token) {
      return res.status(401).json({ error: 'Conta YouTube não conectada.' });
    }

    try {
      const config = await ensureLibraryInitialized();
      const ytRes = await fetch(
        'https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&myRating=like&maxResults=15',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!ytRes.ok) {
        return res.status(ytRes.status).json({ error: 'Sessão YouTube expirada ou sem permissão.' });
      }
      const ytJson = (await ytRes.json()) as {
        items?: Array<{
          id: string;
          snippet?: {
            title?: string;
            description?: string;
            channelTitle?: string;
            thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
            tags?: string[];
          };
          contentDetails?: { duration?: string };
        }>;
      };

      const posts: SocialPostResult[] = (ytJson.items || []).map((v) => {
        const title = v.snippet?.title || 'Vídeo do YouTube';
        const desc = (v.snippet?.description || '').slice(0, 180);
        const tags = (v.snippet?.tags || []).slice(0, 4);
        const duration = parseIsoDuration(v.contentDetails?.duration);
        const isShort = v.contentDetails?.duration?.match(/^PT\d+S$/);
        const videoTypeSlug: VideoTypeFilter = isShort ? 'curto' : 'todos';

        return {
          id: `yt-liked-${v.id}`,
          title,
          author: v.snippet?.channelTitle || 'Canal YouTube',
          platform: 'YouTube',
          videoType: mapVideoTypeLabel(videoTypeSlug),
          videoTypeSlug,
          duration,
          summary: desc || 'Vídeo curtido na sua conta YouTube conectada.',
          postUrl: `https://www.youtube.com/watch?v=${v.id}`,
          thumbnailUrl:
            v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url,
          suggestedCategorySlug: classifyCategoryByRules(
            `${title} ${desc} ${tags.join(' ')}`,
            config
          ),
          tags,
          hasDirectStream: false,
          sourceEngine: 'social-search',
        };
      });

      return res.json({ results: posts });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao buscar vídeos do YouTube.',
      });
    }
  });

  // Fetch saved / upvoted video posts from connected Reddit account
  app.get('/api/auth/reddit/saved', async (req, res) => {
    const cookies = parseCookies(req);
    const sid = cookies.acervoclip_sid;
    const redditSession = sid ? oauthSessions.get(sid)?.reddit : undefined;
    if (!redditSession?.accessToken || !redditSession.username) {
      return res.status(401).json({ error: 'Conta Reddit não conectada.' });
    }

    try {
      const config = await ensureLibraryInitialized();
      const rdRes = await fetch(
        `https://oauth.reddit.com/user/${encodeURIComponent(redditSession.username)}/saved?limit=25`,
        {
          headers: {
            Authorization: `Bearer ${redditSession.accessToken}`,
            'User-Agent': `AcervoClip/1.0 by ${redditSession.username}`,
          },
        }
      );
      if (!rdRes.ok) {
        return res.status(rdRes.status).json({ error: 'Sessão Reddit expirada ou sem permissão.' });
      }
      const rdJson = (await rdRes.json()) as {
        data?: {
          children?: Array<{
            data?: {
              id?: string;
              title?: string;
              author?: string;
              subreddit?: string;
              permalink?: string;
              url?: string;
              is_video?: boolean;
              thumbnail?: string;
              secure_media?: {
                reddit_video?: { fallback_url?: string; duration?: number };
              };
            };
          }>;
        };
      };

      const posts: SocialPostResult[] = [];
      for (const child of rdJson.data?.children || []) {
        const d = child.data;
        if (!d || !d.title) continue;
        const videoObj = d.secure_media?.reddit_video;
        const directMediaUrl = videoObj?.fallback_url;
        const postUrl = d.permalink ? `https://www.reddit.com${d.permalink}` : d.url || '';
        const isVideo = Boolean(d.is_video || directMediaUrl || /youtube|youtu\.be|vimeo/i.test(d.url || ''));
        if (!isVideo) continue;

        const sec = Math.round(Number(videoObj?.duration || 0));
        const duration =
          sec > 0
            ? `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
            : 'Vídeo';

        const thumb =
          d.thumbnail && d.thumbnail.startsWith('http') ? d.thumbnail : undefined;

        posts.push({
          id: `rd-saved-${d.id || crypto.randomBytes(3).toString('hex')}`,
          title: d.title,
          author: `u/${d.author || 'reddit'} · r/${d.subreddit || 'all'}`,
          platform: 'Reddit',
          videoType: sec > 0 && sec <= 60 ? 'Vídeo Curto / Reel' : 'Vídeo Social',
          videoTypeSlug: sec > 0 && sec <= 60 ? 'curto' : 'todos',
          duration,
          summary: `Post salvo em r/${d.subreddit || 'reddit'} pronto para download e organização.`,
          postUrl,
          directMediaUrl,
          thumbnailUrl: thumb,
          suggestedCategorySlug: classifyCategoryByRules(
            `${d.title} ${d.subreddit || ''}`,
            config
          ),
          tags: [d.subreddit || 'reddit'],
          hasDirectStream: Boolean(directMediaUrl),
          sourceEngine: 'social-search',
        });
      }

      return res.json({ results: posts });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao buscar posts salvos do Reddit.',
      });
    }
  });

  const httpServer = http.createServer(app);

  // Mount Vite middleware in dev or serve built dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AcervoClip server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AcervoClip server:', err);
  process.exit(1);
});
