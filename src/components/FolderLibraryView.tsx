import { useMemo, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  Folder,
  FolderArchive,
  Play,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { CategorySummary, SavedMediaItem } from '../types';
import { formatBytes, formatDateShort, isSafeExternalUrl } from '../utils/format';
import { MediaThumb } from './MediaThumb';

interface FolderLibraryViewProps {
  categories: CategorySummary[];
  items: SavedMediaItem[];
  selectedCategorySlug: string;
  onSelectCategory: (slug: string) => void;
  onPreviewItem: (item: SavedMediaItem) => void;
  onMoveItem: (
    item: SavedMediaItem,
    targetCategorySlug: string
  ) => Promise<void>;
  onDeleteItem: (item: SavedMediaItem) => Promise<void>;
  onUploadDirectFile: (categorySlug: string, file: File) => Promise<void>;
  onGoExplore: () => void;
}

export function FolderLibraryView({
  categories,
  items,
  selectedCategorySlug,
  onSelectCategory,
  onPreviewItem,
  onMoveItem,
  onDeleteItem,
  onUploadDirectFile,
  onGoExplore,
}: FolderLibraryViewProps) {
  const [filterText, setFilterText] = useState('');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'mp4' | 'package'>('all');
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const activeCategory =
    selectedCategorySlug === 'todas'
      ? null
      : categories.find((c) => c.slug === selectedCategorySlug) || null;

  const filteredItems = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedCategorySlug !== 'todas' && item.categorySlug !== selectedCategorySlug) {
        return false;
      }
      if (mediaFilter === 'mp4' && !item.hasVideoFile) return false;
      if (mediaFilter === 'package' && item.hasVideoFile) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        item.platform.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q)
      );
    });
  }, [items, selectedCategorySlug, mediaFilter, filterText]);

  const totalShownBytes = filteredItems.reduce((acc, i) => acc + i.videoSizeBytes, 0);

  const handleUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetSlug =
      selectedCategorySlug === 'todas'
        ? categories[0]?.slug || 'tecnologia'
        : selectedCategorySlug;
    setUploading(true);
    try {
      await onUploadDirectFile(targetSlug, file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const zipUrl =
    selectedCategorySlug === 'todas'
      ? '/api/library/export-zip'
      : `/api/library/export-zip?category=${encodeURIComponent(selectedCategorySlug)}`;

  return (
    <div className="space-y-6">
      {/* Folder Header */}
      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">
            Diretório físico · biblioteca/
            {activeCategory ? activeCategory.slug : ''}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            {activeCategory ? activeCategory.name : 'Todas as Pastas por Categoria'}
          </h1>
          <p className="mt-1 text-xs text-slate-600 tabular-nums">
            {filteredItems.length}{' '}
            {filteredItems.length === 1 ? 'item salvo' : 'itens salvos'} ·{' '}
            {filteredItems.filter((i) => i.hasVideoFile).length} vídeos .MP4 ·{' '}
            {formatBytes(totalShownBytes)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <input
            ref={uploadInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={handleUploadChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => uploadInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Enviando...' : 'Enviar Vídeo (.MP4)'}
          </button>

          <a
            href={zipUrl}
            download
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <FolderArchive className="h-3.5 w-3.5" />
            {activeCategory ? 'Baixar Pasta .ZIP' : 'Baixar Biblioteca .ZIP'}
          </a>
        </div>
      </section>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrar por título, rede social ou autor..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'mp4', label: 'Com Vídeo .MP4' },
                { id: 'package', label: 'Pacotes de Link' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMediaFilter(tab.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  mediaFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {selectedCategorySlug !== 'todas' && (
            <button
              type="button"
              onClick={() => onSelectCategory('todas')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
            >
              Ver todas as pastas
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <Folder className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            {items.length === 0
              ? 'Nenhum vídeo salvo nesta pasta ainda'
              : 'Nenhum arquivo corresponde ao filtro atual'}
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-slate-600">
            {items.length === 0
              ? 'Busque posts interessantes na aba Explorar Vídeos ou envie um arquivo .MP4 diretamente para organizar nesta pasta.'
              : 'Ajuste os termos de busca ou selecione outra categoria no menu lateral.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onGoExplore}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap"
            >
              Explorar Vídeos Sociais
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Enviar Vídeo Local (.MP4)
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => {
            const thumbSrc =
              item.hasThumbnail && item.thumbnailFilename
                ? `/api/library/file?category=${encodeURIComponent(item.categorySlug)}&file=${encodeURIComponent(item.thumbnailFilename)}`
                : undefined;

            const downloadHref =
              item.hasVideoFile && item.videoFilename
                ? `/api/library/file?category=${encodeURIComponent(item.categorySlug)}&file=${encodeURIComponent(item.videoFilename)}&download=1`
                : item.htmlFilename
                  ? `/api/library/file?category=${encodeURIComponent(item.categorySlug)}&file=${encodeURIComponent(item.htmlFilename)}&download=1`
                  : undefined;

            return (
              <article
                key={item.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => onPreviewItem(item)}
                  className="relative block w-full text-left focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <MediaThumb
                    src={thumbSrc}
                    alt={item.title}
                    platform={item.platform}
                    duration={
                      item.hasVideoFile
                        ? formatBytes(item.videoSizeBytes)
                        : item.duration
                    }
                  />
                  <span className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/80 text-white transition-transform duration-150 group-hover:scale-105">
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </span>
                </button>

                <div className="flex flex-1 flex-col p-5">
                  <p className="text-xs text-slate-500 truncate tabular-nums">
                    <span className="font-medium text-slate-700">
                      {item.hasVideoFile ? 'Arquivo .MP4' : 'Pacote de Post'}
                    </span>
                    {' · '}
                    <span>{item.platform}</span>
                    {' · '}
                    <span>{formatDateShort(item.savedAt)}</span>
                  </p>

                  <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-slate-900">
                    {item.title}
                  </h3>

                  <p className="mt-1.5 font-mono text-xs text-slate-500 truncate">
                    {item.categorySlug}/{item.videoFilename || item.htmlFilename || `${item.baseSlug}.meta.json`}
                  </p>

                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`move-${item.id}`}
                        className="text-xs font-medium text-slate-500 whitespace-nowrap"
                      >
                        Mover para pasta
                      </label>
                      <select
                        id={`move-${item.id}`}
                        value={item.categorySlug}
                        onChange={(e) => onMoveItem(item, e.target.value)}
                        className="h-8 max-w-[180px] rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                      >
                        {categories.map((cat) => (
                          <option key={cat.slug} value={cat.slug}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onPreviewItem(item)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Play className="h-3.5 w-3.5" />
                        {item.hasVideoFile ? 'Assistir Vídeo' : 'Abrir / Anexar .MP4'}
                      </button>

                      {downloadHref && (
                        <a
                          href={downloadHref}
                          download
                          aria-label={`Baixar ${item.title}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}

                      {isSafeExternalUrl(item.postUrl) && (
                        <a
                          href={item.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir post original de ${item.title}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => onDeleteItem(item)}
                        aria-label={`Excluir ${item.title}`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
