import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FolderCheck,
  Globe,
  Link2,
  LogOut,
  RefreshCw,
  Search,
  UserCheck,
} from 'lucide-react';
import type {
  CategorySummary,
  OAuthProviderId,
  OAuthProviderStatus,
  SocialAuthStatusResponse,
  SocialPostResult,
} from '../types';
import { isSafeExternalUrl } from '../utils/format';
import { MediaThumb } from './MediaThumb';

interface ConnectedAccountsViewProps {
  categories: CategorySummary[];
  downloadingIds: Record<string, boolean>;
  savedPostIds: Record<string, string>;
  onDownloadPost: (post: SocialPostResult, categorySlug: string) => Promise<void>;
  onOpenFolder: (categorySlug: string) => void;
  onNotify: (msg: string) => void;
}

const IMPORT_ACTION_LABELS: Partial<Record<OAuthProviderId, string>> = {
  youtube: 'Importar Vídeos Curtidos',
  reddit: 'Importar Posts Salvos',
  mastodon: 'Importar Bookmarks (.MP4)',
  vimeo: 'Importar Vídeos Curtidos',
  twitch: 'Importar Vídeos do Canal',
  dailymotion: 'Importar Favoritos',
  tiktok: 'Importar Vídeos da Conta',
  x: 'Importar Bookmarks com Vídeo',
  pinterest: 'Importar Pins Salvos',
  instagram: 'Importar Reels da Conta',
};

const PROVIDER_PLATFORM_NAMES: Record<OAuthProviderId, string> = {
  youtube: 'YouTube',
  reddit: 'Reddit',
  twitch: 'Twitch',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  mastodon: 'Mastodon',
};

export function ConnectedAccountsView({
  categories,
  downloadingIds,
  savedPostIds,
  onDownloadPost,
  onOpenFolder,
  onNotify,
}: ConnectedAccountsViewProps) {
  const [authStatus, setAuthStatus] = useState<SocialAuthStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<OAuthProviderId | null>(null);
  const [fetchingSaved, setFetchingSaved] = useState<OAuthProviderId | null>(null);
  const [importedPosts, setImportedPosts] = useState<SocialPostResult[]>([]);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState('');
  const [mastodonInstance, setMastodonInstance] = useState('mastodon.social');

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (!res.ok) return;
      const data = (await res.json()) as SocialAuthStatusResponse;
      setAuthStatus(data);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        origin !== window.location.origin
      ) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setConnectingProvider(null);
        setErrorMessage(null);
        onNotify('Conta social conectada com sucesso.');
        void loadStatus();
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setConnectingProvider(null);
        setErrorMessage('A autenticação foi cancelada ou não pôde ser concluída.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadStatus, onNotify]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(text);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      // clipboard blocked
    }
  };

  const handleConnect = async (p: OAuthProviderStatus) => {
    setErrorMessage(null);
    setConnectingProvider(p.provider);
    try {
      let endpoint = `/api/auth/${p.provider}/url`;
      if (p.dynamicInstance) {
        const cleanHost = mastodonInstance
          .trim()
          .replace(/^https?:\/\//i, '')
          .split('/')[0];
        if (!cleanHost || !cleanHost.includes('.')) {
          setConnectingProvider(null);
          setErrorMessage('Informe um domínio válido do Fediverso (ex.: mastodon.social, bolha.us, fosstodon.org).');
          return;
        }
        endpoint = `/api/auth/mastodon/url?instance=${encodeURIComponent(cleanHost)}`;
      }

      const res = await fetch(endpoint);
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setConnectingProvider(null);
        setErrorMessage(data.error || 'Não foi possível iniciar o login.');
        return;
      }

      const popup = window.open(data.url, 'oauth_popup', 'width=600,height=700');
      if (!popup) {
        setConnectingProvider(null);
        setErrorMessage(
          'O navegador bloqueou o pop-up de autorização. Permita pop-ups para este site e tente novamente.'
        );
      }
    } catch {
      setConnectingProvider(null);
      setErrorMessage('Erro ao comunicar com o servidor de autenticação.');
    }
  };

  const handleDisconnect = async (provider: OAuthProviderId) => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ provider }),
    });
    const platName = PROVIDER_PLATFORM_NAMES[provider];
    setImportedPosts((prev) => prev.filter((p) => p.platform !== platName));
    onNotify('Conta desconectada.');
    await loadStatus();
  };

  const handleLoadSavedVideos = async (provider: OAuthProviderId) => {
    setFetchingSaved(provider);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/auth/${provider}/saved`);
      const data = (await res.json()) as {
        results?: SocialPostResult[];
        error?: string;
      };
      if (!res.ok) {
        setErrorMessage(data.error || 'Erro ao carregar vídeos salvos da conta.');
        return;
      }
      const list = data.results || [];
      setImportedPosts(list);
      if (list.length === 0) {
        onNotify('Nenhum vídeo salvo ou curtido encontrado nesta conta.');
      }
    } catch {
      setErrorMessage('Falha ao buscar vídeos da conta conectada.');
    } finally {
      setFetchingSaved(null);
    }
  };

  const renderProviderCard = (p: OAuthProviderStatus) => {
    const isConnecting = connectingProvider === p.provider;
    const isFetching = fetchingSaved === p.provider;
    const isActionable = p.configured || Boolean(p.dynamicInstance);

    return (
      <article
        key={p.provider}
        className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">
                {p.dynamicInstance ? 'Fediverso OAuth 2.0' : 'OAuth 2.0'} ·{' '}
                {p.connected ? (
                  <span className="font-medium text-emerald-700">Conectado</span>
                ) : isActionable ? (
                  <span className="font-medium text-slate-700">Pronto para conectar</span>
                ) : (
                  <span className="font-medium text-amber-700">Aguardando credenciais</span>
                )}
              </p>
              <h2 className="mt-1 text-base font-semibold text-slate-900">
                {p.label}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {p.description}
              </p>
            </div>

            {p.connected ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            ) : p.dynamicInstance ? (
              <Globe className="h-5 w-5 shrink-0 text-blue-600" />
            ) : (
              <Link2 className="h-5 w-5 shrink-0 text-slate-400" />
            )}
          </div>

          {p.connected && (
            <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
              {p.avatarUrl ? (
                <img
                  src={p.avatarUrl}
                  alt={p.username || p.label}
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <UserCheck className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {p.username}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {p.instanceHost
                    ? `Conectado em ${p.instanceHost}`
                    : 'Sessão ativa no servidor'}
                </p>
              </div>
            </div>
          )}

          {p.dynamicInstance && !p.connected && (
            <div className="space-y-1.5 border-t border-slate-100 pt-4">
              <label
                htmlFor="mastodon-instance-input"
                className="block text-xs font-medium text-slate-600"
              >
                Servidor ou instância do Fediverso
              </label>
              <input
                id="mastodon-instance-input"
                type="text"
                value={mastodonInstance}
                onChange={(e) => setMastodonInstance(e.target.value)}
                placeholder="Ex.: mastodon.social, bolha.us, fosstodon.org"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
              <p className="text-xs text-slate-500 leading-relaxed">
                {p.envHint}
              </p>
            </div>
          )}

          <div className="space-y-1.5 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-500">
              URL de callback para configurar no provedor
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 border border-slate-200">
              <code className="flex-1 truncate font-mono text-xs text-slate-700">
                {p.callbackUrl}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(p.callbackUrl)}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                {copiedUrl === p.callbackUrl ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedUrl === p.callbackUrl ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            {!isActionable && (
              <p className="text-xs text-slate-500 leading-relaxed">
                Defina{' '}
                <code className="font-mono text-slate-700">{p.envHint}</code>{' '}
                nos Secrets do ambiente para habilitar este login.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          {p.connected ? (
            <>
              {p.supportsImport ? (
                <button
                  type="button"
                  disabled={isFetching}
                  onClick={() => handleLoadSavedVideos(p.provider)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                  {isFetching
                    ? 'Carregando...'
                    : IMPORT_ACTION_LABELS[p.provider] || 'Importar Vídeos Salvos'}
                </button>
              ) : (
                <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-800 whitespace-nowrap">
                  Perfil conectado
                </div>
              )}

              <button
                type="button"
                onClick={() => handleDisconnect(p.provider)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                Desconectar
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={isConnecting || !isActionable}
              onClick={() => handleConnect(p)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 whitespace-nowrap"
            >
              <Link2 className="h-3.5 w-3.5" />
              {isConnecting
                ? 'Aguardando autorização...'
                : `Conectar com ${p.label}`}
            </button>
          )}
        </div>
      </article>
    );
  };

  const providersList = authStatus?.providers || [];
  const filteredProviders = providersList.filter((p) => {
    const q = providerFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      p.label.toLowerCase().includes(q) ||
      p.provider.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Contas Sociais Conectadas (OAuth 2.0 & Fediverso)
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Conecte YouTube, TikTok, Instagram, X, Reddit, Twitch, Vimeo, Dailymotion, Pinterest, LinkedIn ou qualquer servidor Mastodon/Fediverso via pop-up oficial para importar seus vídeos e organizá-los por categoria.
            </p>
          </div>

          <div className="relative w-full md:w-72 shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              placeholder="Filtrar rede social..."
              aria-label="Filtrar redes sociais OAuth"
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </section>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      {loadingStatus ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white" />
          <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white" />
          <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white" />
          <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Nenhuma rede social encontrada para "{providerFilter}".{' '}
          <button
            type="button"
            onClick={() => setProviderFilter('')}
            className="font-medium text-blue-600 hover:underline"
          >
            Mostrar todas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filteredProviders.map(renderProviderCard)}
        </div>
      )}

      {importedPosts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-slate-900 tabular-nums">
            Vídeos importados da conta ({importedPosts.length})
          </h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {importedPosts.map((post) => {
              const targetCat =
                categoryOverrides[post.id] ||
                post.suggestedCategorySlug ||
                categories[0]?.slug ||
                'tecnologia';
              const isBusy = Boolean(downloadingIds[post.id]);
              const savedSlug = savedPostIds[post.id];
              const savedCat = categories.find((c) => c.slug === savedSlug);

              return (
                <article
                  key={post.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <MediaThumb
                    src={post.thumbnailUrl}
                    alt={post.title}
                    platform={post.platform}
                    duration={post.duration}
                  />
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-xs text-slate-500 truncate">
                      <span className="font-medium text-slate-700">{post.platform}</span>
                      {' · '}
                      <span>{post.author}</span>
                    </p>
                    <h3 className="mt-2 line-clamp-2 text-base font-semibold text-slate-900">
                      {post.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-slate-600">
                      {post.summary}
                    </p>

                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`acct-cat-${post.id}`}
                          className="text-xs font-medium text-slate-500 whitespace-nowrap"
                        >
                          Pasta destino
                        </label>
                        <select
                          id={`acct-cat-${post.id}`}
                          value={targetCat}
                          onChange={(e) =>
                            setCategoryOverrides((prev) => ({
                              ...prev,
                              [post.id]: e.target.value,
                            }))
                          }
                          className="h-8 max-w-[180px] rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                        >
                          {categories.map((c) => (
                            <option key={c.slug} value={c.slug}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        {savedSlug ? (
                          <button
                            type="button"
                            onClick={() => onOpenFolder(savedSlug)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
                          >
                            <FolderCheck className="h-3.5 w-3.5" />
                            Salvo em {savedCat?.name || savedSlug}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onDownloadPost(post, targetCat)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {isBusy ? 'Baixando...' : 'Baixar e Organizar'}
                          </button>
                        )}

                        {isSafeExternalUrl(post.postUrl) && (
                          <a
                            href={post.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Abrir ${post.title}`}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
    </div>
  );
}
