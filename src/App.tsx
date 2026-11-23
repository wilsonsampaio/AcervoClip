import { useCallback, useEffect, useState } from 'react';
import {
  Folder,
  FolderArchive,
  FolderOpen,
  FolderPlus,
  Layers,
  Menu,
  X,
} from 'lucide-react';
import type {
  DownloadQueueEntry,
  LibrarySnapshot,
  SavedMediaItem,
  SocialPlatform,
  SocialPostResult,
  VideoTypeFilter,
} from './types';
import { formatBytes } from './utils/format';
import { ExploreView } from './components/ExploreView';
import { ConnectedAccountsView } from './components/ConnectedAccountsView';
import { FolderLibraryView } from './components/FolderLibraryView';
import { QueueView } from './components/QueueView';
import { RulesView } from './components/RulesView';
import { VideoPreviewModal } from './components/VideoPreviewModal';

type ActiveTab = 'explore' | 'accounts' | 'folders' | 'queue' | 'rules';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('explore');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [library, setLibrary] = useState<LibrarySnapshot>({
    config: { aiAutoCategorize: true, categories: [] },
    categories: [],
    items: [],
    totalItems: 0,
    totalVideos: 0,
    totalBytes: 0,
  });
  const [selectedFolderSlug, setSelectedFolderSlug] = useState<string>('todas');

  const [searchResults, setSearchResults] = useState<SocialPostResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState('');

  const [downloadingIds, setDownloadingIds] = useState<Record<string, boolean>>({});
  const [savedPostIds, setSavedPostIds] = useState<Record<string, string>>({});
  const [queueEntries, setQueueEntries] = useState<DownloadQueueEntry[]>([]);
  const [previewItem, setPreviewItem] = useState<SavedMediaItem | null>(null);

  const [quickFolderOpen, setQuickFolderOpen] = useState(false);
  const [quickFolderName, setQuickFolderName] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 4000);
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/library');
      if (!res.ok) return;
      const data = (await res.json()) as LibrarySnapshot;
      setLibrary(data);
    } catch {
      // keep existing state on transient error
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const handleSearch = async (
    query: string,
    platform: SocialPlatform,
    videoType: VideoTypeFilter,
    customPlatform?: string
  ) => {
    setSearching(true);
    setSearchError(null);
    setSearchWarning(null);
    setLastQuery(query);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, platform, customPlatform, videoType }),
      });
      const data = (await res.json()) as {
        results?: SocialPostResult[];
        error?: string;
        warning?: string;
      };
      if (!res.ok) {
        setSearchError(data.error || 'Não foi possível concluir a busca.');
        setSearchResults([]);
        return;
      }
      setSearchResults(data.results || []);
      if (data.warning) setSearchWarning(data.warning);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : 'Erro de conexão com o servidor.'
      );
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleInspectUrl = async (url: string, videoType: VideoTypeFilter) => {
    setSearching(true);
    setSearchError(null);
    setSearchWarning(null);
    setLastQuery(url);
    try {
      const res = await fetch('/api/inspect-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, videoType }),
      });
      const data = (await res.json()) as {
        post?: SocialPostResult;
        error?: string;
      };
      if (!res.ok || !data.post) {
        setSearchError(data.error || 'Não foi possível inspecionar este link.');
        setSearchResults([]);
        return;
      }
      setSearchResults([data.post]);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : 'Erro ao inspecionar URL.'
      );
    } finally {
      setSearching(false);
    }
  };

  const handleDownloadPost = async (
    post: SocialPostResult,
    categorySlug: string
  ) => {
    const catObj = library.categories.find((c) => c.slug === categorySlug);
    const categoryName = catObj?.name || categorySlug;
    const queueId = `${post.id}-${Date.now()}`;

    setDownloadingIds((prev) => ({ ...prev, [post.id]: true }));
    setQueueEntries((prev) => [
      {
        queueId,
        postId: post.id,
        title: post.title,
        platform: post.platform,
        categorySlug,
        categoryName,
        status: 'downloading',
        message: `Organizando na pasta ${categoryName}...`,
        startedAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post, categorySlug }),
      });
      const data = (await res.json()) as {
        savedItem?: SavedMediaItem;
        message?: string;
        error?: string;
      };

      if (!res.ok || !data.savedItem) {
        throw new Error(data.error || 'Falha ao salvar na pasta.');
      }

      const saved = data.savedItem;
      setSavedPostIds((prev) => ({ ...prev, [post.id]: saved.categorySlug }));
      setQueueEntries((prev) =>
        prev.map((entry) =>
          entry.queueId === queueId
            ? {
                ...entry,
                status: saved.hasVideoFile ? 'completed' : 'package-only',
                message:
                  data.message ||
                  `Salvo em biblioteca/${saved.categorySlug}`,
                savedItem: saved,
              }
            : entry
        )
      );
      showToast(data.message || `Salvo na pasta ${saved.categoryName}.`);
      await refreshLibrary();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro no download.';
      setQueueEntries((prev) =>
        prev.map((entry) =>
          entry.queueId === queueId
            ? { ...entry, status: 'error', message: msg }
            : entry
        )
      );
      showToast(msg);
    } finally {
      setDownloadingIds((prev) => ({ ...prev, [post.id]: false }));
    }
  };

  const handleBatchDownload = async (
    items: Array<{ post: SocialPostResult; categorySlug: string }>
  ) => {
    for (const item of items) {
      await handleDownloadPost(item.post, item.categorySlug);
    }
  };

  const handleMoveItem = async (
    item: SavedMediaItem,
    targetCategorySlug: string
  ) => {
    if (item.categorySlug === targetCategorySlug) return;
    const res = await fetch('/api/library/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromCategory: item.categorySlug,
        toCategory: targetCategorySlug,
        baseSlug: item.baseSlug,
      }),
    });
    if (res.ok) {
      const targetName =
        library.categories.find((c) => c.slug === targetCategorySlug)?.name ||
        targetCategorySlug;
      showToast(`Arquivo movido para "${targetName}".`);
      await refreshLibrary();
    }
  };

  const handleDeleteItem = async (item: SavedMediaItem) => {
    const res = await fetch(
      `/api/library/item?category=${encodeURIComponent(item.categorySlug)}&baseSlug=${encodeURIComponent(item.baseSlug)}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      if (previewItem?.id === item.id) setPreviewItem(null);
      showToast(`"${item.title}" removido da pasta.`);
      await refreshLibrary();
    }
  };

  const handleUploadFile = async (
    categorySlug: string,
    file: File,
    attachBaseSlug?: string
  ) => {
    const res = await fetch('/api/library/upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'x-category-slug': categorySlug,
        'x-filename': encodeURIComponent(file.name),
        ...(attachBaseSlug ? { 'x-base-slug': attachBaseSlug } : {}),
      },
      body: file,
    });
    const data = (await res.json()) as {
      savedItem?: SavedMediaItem;
      error?: string;
    };
    if (!res.ok || !data.savedItem) {
      showToast(data.error || 'Erro ao enviar arquivo.');
      return;
    }
    showToast(`Vídeo salvo em "${data.savedItem.categoryName}".`);
    if (previewItem && attachBaseSlug && previewItem.baseSlug === attachBaseSlug) {
      setPreviewItem(data.savedItem);
    }
    await refreshLibrary();
  };

  const handleCreateCategory = async (name: string, keywords: string) => {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, keywords }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao criar pasta.');
    }
    await refreshLibrary();
  };

  const handleUpdateCategory = async (
    slug: string,
    name: string,
    keywords: string
  ) => {
    const res = await fetch(`/api/categories/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, keywords }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao salvar regras.');
    }
    await refreshLibrary();
  };

  const handleDeleteCategory = async (slug: string) => {
    const res = await fetch(`/api/categories/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      if (selectedFolderSlug === slug) setSelectedFolderSlug('todas');
      showToast('Pasta removida.');
      await refreshLibrary();
    }
  };

  const handleToggleAiAutoCategorize = async (enabled: boolean) => {
    const firstSlug = library.categories[0]?.slug;
    if (!firstSlug) return;
    await fetch(`/api/categories/${encodeURIComponent(firstSlug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiAutoCategorize: enabled }),
    });
    await refreshLibrary();
  };

  const handleQuickCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickFolderName.trim()) return;
    try {
      await handleCreateCategory(quickFolderName.trim(), '');
      setQuickFolderName('');
      setQuickFolderOpen(false);
      showToast('Nova pasta criada na biblioteca.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao criar pasta.');
    }
  };

  const openFolderTab = (slug: string) => {
    setSelectedFolderSlug(slug);
    setActiveTab('folders');
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navigation Bar: Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Alternar menu de pastas"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <a
              href="#explorar"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('explore');
              }}
              className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              AcervoClip
            </a>
          </div>

          {/* Zone 2: 4 clean single-line navigation links */}
          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {(
              [
                { id: 'explore', label: 'Explorar Vídeos' },
                { id: 'accounts', label: 'Contas Sociais' },
                { id: 'folders', label: 'Pastas por Categoria' },
                { id: 'queue', label: 'Fila de Downloads' },
                { id: 'rules', label: 'Regras Automáticas' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-blue-600 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary CTA button */}
          <div className="shrink-0">
            <a
              href="/api/library/export-zip"
              download
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <FolderArchive className="h-3.5 w-3.5" />
              Baixar Acervo .ZIP
            </a>
          </div>
        </div>
      </header>

      {/* Main Workspace Canvas: Sidebar + Content */}
      <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
        {/* Mobile Navigation & Folder Drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-slate-200 bg-white p-4 lg:hidden">
            <div className="mb-4 grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'explore', label: 'Explorar Vídeos' },
                  { id: 'accounts', label: 'Contas Sociais' },
                  { id: 'folders', label: 'Pastas por Categoria' },
                  { id: 'queue', label: 'Fila de Downloads' },
                  { id: 'rules', label: 'Regras Automáticas' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-medium text-left ${
                    activeTab === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              {library.categories.map((cat) => (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => openFolderTab(cat.slug)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                >
                  <span className="truncate">{cat.name}</span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {cat.itemCount}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Desktop Left Sidebar */}
        <aside className="hidden w-[264px] shrink-0 border-r border-slate-200 bg-white px-4 py-6 lg:block">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-semibold text-slate-500">
              Pastas por Categoria
            </h2>
            <button
              type="button"
              onClick={() => setQuickFolderOpen((v) => !v)}
              aria-label="Criar nova pasta"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>

          {quickFolderOpen && (
            <form onSubmit={handleQuickCreateFolder} className="mt-3 space-y-2 px-1">
              <input
                type="text"
                value={quickFolderName}
                onChange={(e) => setQuickFolderName(e.target.value)}
                placeholder="Nome da nova pasta..."
                className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setQuickFolderOpen(false)}
                  className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="mt-3 space-y-1">
            <button
              type="button"
              onClick={() => openFolderTab('todas')}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                activeTab === 'folders' && selectedFolderSlug === 'todas'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Layers className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">Todas as Pastas</span>
              </span>
              <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                {library.totalItems}
              </span>
            </button>

            {library.categories.map((cat) => {
              const isActive =
                activeTab === 'folders' && selectedFolderSlug === cat.slug;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => openFolderTab(cat.slug)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {isActive ? (
                      <FolderOpen className="h-4 w-4 shrink-0 text-blue-600" />
                    ) : (
                      <Folder className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <span className="truncate">{cat.name}</span>
                  </span>
                  <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                    {cat.itemCount}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-8 border-t border-slate-100 pt-5 px-2 space-y-1.5 text-xs text-slate-500 tabular-nums">
            <div className="flex items-center justify-between">
              <span>Arquivos .MP4</span>
              <span className="font-mono font-medium text-slate-800">
                {library.totalVideos}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Espaço usado</span>
              <span className="font-mono font-medium text-slate-800">
                {formatBytes(library.totalBytes)}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="min-w-0 flex-1 p-6 lg:p-8">
          {activeTab === 'explore' && (
            <ExploreView
              categories={library.categories}
              results={searchResults}
              searching={searching}
              searchError={searchError}
              searchWarning={searchWarning}
              lastQuery={lastQuery}
              downloadingIds={downloadingIds}
              savedPostIds={savedPostIds}
              onSearch={handleSearch}
              onInspectUrl={handleInspectUrl}
              onDownloadPost={handleDownloadPost}
              onBatchDownload={handleBatchDownload}
              onOpenFolder={openFolderTab}
            />
          )}

          {activeTab === 'accounts' && (
            <ConnectedAccountsView
              categories={library.categories}
              downloadingIds={downloadingIds}
              savedPostIds={savedPostIds}
              onDownloadPost={handleDownloadPost}
              onOpenFolder={openFolderTab}
              onNotify={showToast}
            />
          )}

          {activeTab === 'folders' && (
            <FolderLibraryView
              categories={library.categories}
              items={library.items}
              selectedCategorySlug={selectedFolderSlug}
              onSelectCategory={setSelectedFolderSlug}
              onPreviewItem={setPreviewItem}
              onMoveItem={handleMoveItem}
              onDeleteItem={handleDeleteItem}
              onUploadDirectFile={(slug, file) => handleUploadFile(slug, file)}
              onGoExplore={() => setActiveTab('explore')}
            />
          )}

          {activeTab === 'queue' && (
            <QueueView
              entries={queueEntries}
              onOpenFolder={openFolderTab}
              onClearCompleted={() =>
                setQueueEntries((prev) =>
                  prev.filter((e) => e.status === 'downloading')
                )
              }
              onGoExplore={() => setActiveTab('explore')}
            />
          )}

          {activeTab === 'rules' && (
            <RulesView
              categories={library.categories}
              aiAutoCategorize={library.config.aiAutoCategorize}
              onToggleAiAutoCategorize={handleToggleAiAutoCategorize}
              onCreateCategory={handleCreateCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
            />
          )}
        </main>
      </div>

      {/* Video Player & Attachment Modal */}
      <VideoPreviewModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onUploadAttached={(item, file) =>
          handleUploadFile(item.categorySlug, file, item.baseSlug)
        }
      />

      {/* Action Confirmation Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-40 max-w-sm rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
