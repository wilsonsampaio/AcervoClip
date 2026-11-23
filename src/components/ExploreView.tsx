import { useState } from 'react';
import {
  CheckSquare,
  Download,
  ExternalLink,
  FolderCheck,
  Link2,
  Search,
  Square,
} from 'lucide-react';
import type {
  CategorySummary,
  SocialPlatform,
  SocialPostResult,
  VideoTypeFilter,
} from '../types';
import {
  NETWORK_GROUP_LABELS,
  SOCIAL_NETWORKS,
  type SocialNetworkDefinition,
} from '../constants/networks';
import { isSafeExternalUrl } from '../utils/format';
import { MediaThumb } from './MediaThumb';

interface ExploreViewProps {
  categories: CategorySummary[];
  results: SocialPostResult[];
  searching: boolean;
  searchError: string | null;
  searchWarning: string | null;
  lastQuery: string;
  downloadingIds: Record<string, boolean>;
  savedPostIds: Record<string, string>;
  onSearch: (
    query: string,
    platform: SocialPlatform,
    videoType: VideoTypeFilter,
    customPlatform?: string
  ) => Promise<void>;
  onInspectUrl: (url: string, videoType: VideoTypeFilter) => Promise<void>;
  onDownloadPost: (post: SocialPostResult, categorySlug: string) => Promise<void>;
  onBatchDownload: (
    items: Array<{ post: SocialPostResult; categorySlug: string }>
  ) => Promise<void>;
  onOpenFolder: (categorySlug: string) => void;
}

const VIDEO_TYPES: Array<{ id: VideoTypeFilter; label: string }> = [
  { id: 'todos', label: 'Todos os Tipos' },
  { id: 'curto', label: 'Curtos / Reels / Shorts' },
  { id: 'tutorial', label: 'Tutoriais & Aulas' },
  { id: 'clipe', label: 'Clipes & Cortes' },
  { id: 'analise', label: 'Análises & Reviews' },
  { id: 'documentario', label: 'Documentários' },
  { id: 'viral', label: 'Em Alta / Virais' },
];

const NETWORK_GROUP_ORDER: SocialNetworkDefinition['group'][] = [
  'universal',
  'principais',
  'comunidades',
  'streaming',
  'descentralizadas',
];

const QUICK_TOPICS: Array<{
  label: string;
  query: string;
  videoType: VideoTypeFilter;
  platform: SocialPlatform;
}> = [
  {
    label: 'Tutoriais de Edição & Cinema',
    query: 'video editing color grading tutorial',
    videoType: 'tutorial',
    platform: 'todas',
  },
  {
    label: 'Automação e IA na Prática',
    query: 'inteligencia artificial automacao workflow',
    videoType: 'curto',
    platform: 'todas',
  },
  {
    label: 'Fediverso PeerTube (Aberto)',
    query: 'creative coding blender animation',
    videoType: 'tutorial',
    platform: 'peertube',
  },
  {
    label: 'Vídeos .MP4 no Mastodon',
    query: 'animation',
    videoType: 'curto',
    platform: 'mastodon',
  },
  {
    label: 'Acervo Aberto (.MP4 Direto)',
    query: 'science space documentary',
    videoType: 'documentario',
    platform: 'archive',
  },
];

export function ExploreView({
  categories,
  results,
  searching,
  searchError,
  searchWarning,
  lastQuery,
  downloadingIds,
  savedPostIds,
  onSearch,
  onInspectUrl,
  onDownloadPost,
  onBatchDownload,
  onOpenFolder,
}: ExploreViewProps) {
  const [mode, setMode] = useState<'topic' | 'url'>('topic');
  const [query, setQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [platform, setPlatform] = useState<SocialPlatform>('todas');
  const [customPlatform, setCustomPlatform] = useState('');
  const [formHint, setFormHint] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<VideoTypeFilter>('todos');
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const getTargetCategory = (post: SocialPostResult) => {
    return categoryOverrides[post.id] || post.suggestedCategorySlug || categories[0]?.slug || 'tecnologia';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormHint(null);
    setSelectedIds({});
    if (mode === 'topic') {
      if (!query.trim()) {
        setFormHint('Digite um tema para procurar vídeos.');
        return;
      }
      if (platform === 'custom' && customPlatform.trim().length < 2) {
        setFormHint('Informe o nome ou domínio da rede social personalizada (ex.: douyin.com, sharechat.com).');
        return;
      }
      await onSearch(
        query.trim(),
        platform,
        videoType,
        platform === 'custom' ? customPlatform.trim() : undefined
      );
    } else {
      if (!urlInput.trim()) {
        setFormHint('Cole uma URL pública para inspecionar.');
        return;
      }
      await onInspectUrl(urlInput.trim(), videoType);
    }
  };

  const handleQuickSearch = async (preset: (typeof QUICK_TOPICS)[number]) => {
    setFormHint(null);
    setMode('topic');
    setQuery(preset.query);
    setPlatform(preset.platform);
    setVideoType(preset.videoType);
    setSelectedIds({});
    await onSearch(preset.query, preset.platform, preset.videoType);
  };

  const selectedPosts = results.filter((r) => selectedIds[r.id]);
  const allSelected = results.length > 0 && selectedPosts.length === results.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds({});
    } else {
      const next: Record<string, boolean> = {};
      for (const r of results) next[r.id] = true;
      setSelectedIds(next);
    }
  };

  return (
    <div className="space-y-8">
      {/* Search & Video Type Studio */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Procurar posts e vídeos nas redes sociais
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Escolha o tipo de vídeo desejado, filtre pela rede social e baixe organizando automaticamente em pastas por categoria.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start shrink-0">
            <button
              type="button"
              onClick={() => setMode('topic')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mode === 'topic'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              Buscar por Tema
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                mode === 'url'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              Colar Link Direto
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            {mode === 'topic' ? (
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex.: automação com IA, receitas rápidas, design de interface, cortes de podcast..."
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            ) : (
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Cole a URL do post social ou link direto .MP4 (https://...)"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={searching}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {searching
                ? 'Procurando...'
                : mode === 'topic'
                  ? 'Buscar Vídeos'
                  : 'Inspecionar Link'}
            </button>
          </div>

          {/* Tipo de Vídeo Selector */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <span className="block text-xs font-medium text-slate-500">
                  Tipo de vídeo a procurar
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {VIDEO_TYPES.map((vt) => (
                    <button
                      key={vt.id}
                      type="button"
                      onClick={() => setVideoType(vt.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        videoType === vt.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                    >
                      {vt.label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'topic' && (
                <div className="space-y-2">
                  <label
                    htmlFor="network-select"
                    className="block text-xs font-medium text-slate-500"
                  >
                    Rede social ou acervo (todas as redes + personalizada)
                  </label>
                  <select
                    id="network-select"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
                    aria-label="Selecionar rede social"
                    className="h-9 w-full sm:w-auto min-w-[240px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
                  >
                    {NETWORK_GROUP_ORDER.map((groupKey) => {
                      const items = SOCIAL_NETWORKS.filter((n) => n.group === groupKey);
                      if (items.length === 0) return null;
                      return (
                        <optgroup key={groupKey} label={NETWORK_GROUP_LABELS[groupKey]}>
                          {items.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.label}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            {mode === 'topic' && platform === 'custom' && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <label
                  htmlFor="custom-platform-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Nome ou domínio de qualquer outra rede social (mesmo que ainda não listada)
                </label>
                <input
                  id="custom-platform-input"
                  type="text"
                  value={customPlatform}
                  onChange={(e) => setCustomPlatform(e.target.value)}
                  placeholder="Ex.: douyin.com, xiaohongshu.com, sharechat.com, ok.ru, niconico.jp, pixelfed.social..."
                  className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            {formHint && (
              <p role="alert" className="text-xs font-medium text-amber-800">
                {formHint}
              </p>
            )}
          </div>
        </form>
      </section>

      {searchError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800"
        >
          <p className="font-medium">Não foi possível concluir a busca</p>
          <p className="mt-0.5 text-xs text-red-700">{searchError}</p>
        </div>
      )}

      {searchWarning && !searchError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900">
          {searchWarning}
        </div>
      )}

      {/* Loading Skeletons */}
      {searching && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <div className="aspect-video w-full animate-pulse bg-slate-200" />
              <div className="space-y-3 p-5">
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                <div className="h-5 w-4/5 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-9 w-full animate-pulse rounded-lg bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search Results */}
      {!searching && results.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600 tabular-nums">
              <span className="font-semibold text-slate-900">{results.length}</span>{' '}
              {results.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
              {lastQuery ? ` para "${lastQuery}"` : ''}
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {allSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                ) : (
                  <Square className="h-3.5 w-3.5 text-slate-400" />
                )}
                {allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </button>

              {selectedPosts.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onBatchDownload(
                      selectedPosts.map((post) => ({
                        post,
                        categorySlug: getTargetCategory(post),
                      }))
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar Selecionados ({selectedPosts.length})
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {results.map((post) => {
              const targetCat = getTargetCategory(post);
              const isBusy = Boolean(downloadingIds[post.id]);
              const savedFolderSlug = savedPostIds[post.id];
              const isSelected = Boolean(selectedIds[post.id]);
              const matchedCategoryObj = categories.find((c) => c.slug === savedFolderSlug);

              return (
                <article
                  key={post.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300"
                >
                  <div className="relative">
                    <MediaThumb
                      src={post.thumbnailUrl}
                      alt={post.title}
                      platform={post.platform}
                      duration={post.duration}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIds((prev) => ({
                          ...prev,
                          [post.id]: !prev[post.id],
                        }))
                      }
                      aria-label={`Selecionar ${post.title}`}
                      className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-slate-700 shadow-xs transition-colors hover:bg-white"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-500" />
                      )}
                    </button>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    {/* Clean unboxed metadata with typographic separators (no pills) */}
                    <p className="text-xs text-slate-500 truncate">
                      <span className="font-medium text-slate-700">{post.platform}</span>
                      {' · '}
                      <span>{post.videoType}</span>
                      {' · '}
                      <span>{post.author}</span>
                    </p>

                    <h2 className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-slate-900">
                      {post.title}
                    </h2>

                    <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-slate-600">
                      {post.summary ||
                        'Post localizado para curadoria, download e arquivamento por categoria.'}
                    </p>

                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`cat-${post.id}`}
                          className="text-xs font-medium text-slate-500 whitespace-nowrap"
                        >
                          Pasta destino
                        </label>
                        <select
                          id={`cat-${post.id}`}
                          value={targetCat}
                          onChange={(e) =>
                            setCategoryOverrides((prev) => ({
                              ...prev,
                              [post.id]: e.target.value,
                            }))
                          }
                          className="h-8 max-w-[190px] rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                        >
                          {categories.map((cat) => (
                            <option key={cat.slug} value={cat.slug}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        {savedFolderSlug ? (
                          <button
                            type="button"
                            onClick={() => onOpenFolder(savedFolderSlug)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
                          >
                            <FolderCheck className="h-3.5 w-3.5" />
                            Salvo em {matchedCategoryObj?.name || savedFolderSlug}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onDownloadPost(post, targetCat)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {isBusy
                              ? 'Baixando...'
                              : post.hasDirectStream
                                ? 'Baixar .MP4 na Pasta'
                                : 'Baixar e Organizar'}
                          </button>
                        )}

                        {isSafeExternalUrl(post.postUrl) && (
                          <a
                            href={post.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Abrir post original: ${post.title}`}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Initial Editorial Showcase (Empty State before first search) */}
      {!searching && results.length === 0 && (
        <div className="space-y-8">
          <section className="grid grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-12 lg:items-stretch">
            <div className="flex flex-col justify-between p-8 lg:col-span-7">
              <div className="space-y-4">
                <p className="text-xs font-medium text-slate-500">
                  Fluxo de curadoria e arquivamento local
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  Encontre vídeos sociais por formato e salve tudo organizado em pastas reais
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-slate-600">
                  Pesquise publicações por tipo de vídeo — de Shorts e Reels a tutoriais ou documentários — ou cole um link direto. Cada arquivo baixado é classificado automaticamente e gravado na pasta correspondente da sua biblioteca.
                </p>
              </div>

              <div className="mt-8 space-y-3 border-t border-slate-100 pt-6">
                <p className="text-xs font-medium text-slate-500">
                  Sugestões rápidas para testar agora
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TOPICS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleQuickSearch(preset)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 whitespace-nowrap"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative min-h-[260px] bg-slate-100 lg:col-span-5">
              <img
                src="/src/assets/images/discovery_workspace_banner_1795436842477.jpg"
                alt="Estação de edição e curadoria de vídeos organizada"
                className="h-full w-full object-cover"
              />
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
                <img
                  src="/src/assets/images/category_tech_preview_1795436843688.jpg"
                  alt="Equipamentos de tecnologia e câmera representando pasta Tecnologia"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6">
                <p className="text-xs text-slate-500">
                  01 · Classificação Automática por Palavras-Chave e IA
                </p>
                <h3 className="mt-1.5 text-base font-semibold text-slate-900">
                  Roteamento direto para cada pasta de categoria
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Vídeos sobre programação, IA ou gadgets vão automaticamente para Tecnologia; edição e UI/UX seguem para Design e Criação. Você também pode personalizar palavras-chave ou mover arquivos manualmente.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
                <img
                  src="/src/assets/images/category_creative_preview_1795436842670.jpg"
                  alt="Estúdio minimalista de áudio e criação visual"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-6">
                <p className="text-xs text-slate-500">
                  02 · Exportação em Lote Preservando Diretórios
                </p>
                <h3 className="mt-1.5 text-base font-semibold text-slate-900">
                  Baixe vídeos individuais ou a pasta inteira em .ZIP
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Streams diretos (.MP4/.WebM) e acervos abertos são salvos com miniatura extraída automaticamente; quando desejar levar tudo para seu computador, exporte uma categoria ou o acervo completo em .ZIP.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
