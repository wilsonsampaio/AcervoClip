import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Upload,
  X,
} from 'lucide-react';
import type { SavedMediaItem } from '../types';
import { formatBytes, formatDateShort, isSafeExternalUrl } from '../utils/format';

interface VideoPreviewModalProps {
  item: SavedMediaItem | null;
  onClose: () => void;
  onUploadAttached: (item: SavedMediaItem, file: File) => Promise<void>;
}

export function VideoPreviewModal({
  item,
  onClose,
  onUploadAttached,
}: VideoPreviewModalProps) {
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!item) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [item, onClose]);

  if (!item) return null;

  const videoSrc =
    item.hasVideoFile && item.videoFilename
      ? `/api/library/file?category=${encodeURIComponent(item.categorySlug)}&file=${encodeURIComponent(item.videoFilename)}`
      : null;

  const downloadFileHref =
    item.hasVideoFile && item.videoFilename
      ? `/api/library/file?category=${encodeURIComponent(item.categorySlug)}&file=${encodeURIComponent(item.videoFilename)}&download=1`
      : item.htmlFilename
        ? `/api/library/file?category=${encodeURIComponent(item.categorySlug)}&file=${encodeURIComponent(item.htmlFilename)}&download=1`
        : null;

  const ytdlpCmd = item.postUrl
    ? `yt-dlp -o "${item.categoryName}/${item.baseSlug}.%(ext)s" "${item.postUrl}"`
    : '';

  const handleCopyCommand = async () => {
    if (!ytdlpCmd) return;
    try {
      await navigator.clipboard.writeText(ytdlpCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUploadAttached(item, file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-preview-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 truncate">
              {item.platform} · {item.videoType} · Pasta: {item.categoryName}
            </p>
            <h2
              id="modal-preview-title"
              className="mt-0.5 text-base font-semibold text-slate-900 truncate"
            >
              {item.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar visualização"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="bg-slate-950">
          {videoSrc ? (
            <video
              key={videoSrc}
              src={videoSrc}
              controls
              autoPlay
              className="aspect-video w-full bg-black object-contain"
            />
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-slate-900 px-8 text-center text-slate-200">
              <FolderOpen className="h-10 w-10 text-slate-400" strokeWidth={1.5} />
              <div className="max-w-lg space-y-1.5">
                <p className="text-sm font-semibold text-white">
                  Pacote de post organizado na pasta {item.categoryName}
                </p>
                <p className="text-xs leading-relaxed text-slate-300">
                  Esta rede social protege o fluxo de vídeo contra download direto sem sessão. Você pode abrir o post original, copiar o comando de terminal abaixo já configurado com a pasta ou anexar um arquivo .MP4 local diretamente nesta categoria.
                </p>
              </div>
              {ytdlpCmd && (
                <div className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left">
                  <code className="flex-1 truncate font-mono text-xs text-slate-300">
                    {ytdlpCmd}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyCommand}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 whitespace-nowrap"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-xs text-slate-600">
            <p className="font-medium text-slate-900">
              {item.author} · Salvo em {formatDateShort(item.savedAt)}
            </p>
            <p className="font-mono text-slate-500 tabular-nums">
              biblioteca/{item.categorySlug}/
              {item.videoFilename || item.htmlFilename || `${item.baseSlug}.meta.json`}
              {item.videoSizeBytes > 0 ? ` · ${formatBytes(item.videoSizeBytes)}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading
                ? 'Enviando...'
                : item.hasVideoFile
                  ? 'Substituir .MP4'
                  : 'Anexar .MP4 local'}
            </button>

            {isSafeExternalUrl(item.postUrl) && (
              <a
                href={item.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir Post
              </a>
            )}

            {downloadFileHref && (
              <a
                href={downloadFileHref}
                download
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                {item.hasVideoFile ? 'Baixar .MP4' : 'Baixar Pacote'}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
