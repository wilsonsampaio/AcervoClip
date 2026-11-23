import { useState } from 'react';
import { FolderPlus, Save, Trash2 } from 'lucide-react';
import type { CategorySummary } from '../types';

interface RulesViewProps {
  categories: CategorySummary[];
  aiAutoCategorize: boolean;
  onToggleAiAutoCategorize: (enabled: boolean) => Promise<void>;
  onCreateCategory: (name: string, keywords: string) => Promise<void>;
  onUpdateCategory: (
    slug: string,
    name: string,
    keywords: string
  ) => Promise<void>;
  onDeleteCategory: (slug: string) => Promise<void>;
}

export function RulesView({
  categories,
  aiAutoCategorize,
  onToggleAiAutoCategorize,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}: RulesViewProps) {
  const [newName, setNewName] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [creating, setCreating] = useState(false);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftKeywords, setDraftKeywords] = useState<Record<string, string>>({});
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setFeedback(null);
    try {
      await onCreateCategory(newName.trim(), newKeywords.trim());
      setNewName('');
      setNewKeywords('');
      setFeedback('Nova pasta criada e pronta para receber arquivos.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao criar pasta.');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveCategory = async (cat: CategorySummary) => {
    setSavingSlug(cat.slug);
    setFeedback(null);
    try {
      const name = draftNames[cat.slug] ?? cat.name;
      const keywords = draftKeywords[cat.slug] ?? cat.keywords.join(', ');
      await onUpdateCategory(cat.slug, name, keywords);
      setFeedback(`Regras da pasta "${name}" atualizadas.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao salvar regras.');
    } finally {
      setSavingSlug(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Regras de Organização por Categoria
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Defina pastas personalizadas e palavras-chave que direcionam cada vídeo baixado automaticamente para o diretório correto.
          </p>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-800 shrink-0">
          <input
            type="checkbox"
            checked={aiAutoCategorize}
            onChange={(e) => onToggleAiAutoCategorize(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          <span>Classificação automática por contexto (IA)</span>
        </label>
      </section>

      {feedback && (
        <div className="rounded-xl border border-slate-200 bg-slate-900 px-5 py-3 text-xs font-medium text-white">
          {feedback}
        </div>
      )}

      {/* Create New Category Folder */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Criar nova pasta de categoria
        </h2>
        <form
          onSubmit={handleCreate}
          className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12"
        >
          <div className="md:col-span-4">
            <label htmlFor="new-cat-name" className="sr-only">
              Nome da pasta
            </label>
            <input
              id="new-cat-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome da pasta (ex.: Arquitetura)"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="md:col-span-6">
            <label htmlFor="new-cat-keywords" className="sr-only">
              Palavras-chave separadas por vírgula
            </label>
            <input
              id="new-cat-keywords"
              type="text"
              value={newKeywords}
              onChange={(e) => setNewKeywords(e.target.value)}
              placeholder="Palavras-chave (ex.: casa, reforma, planta, interiores)"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {creating ? 'Criando...' : 'Criar Pasta'}
            </button>
          </div>
        </form>
      </section>

      {/* Existing Categories Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-200">
          {categories.map((cat) => {
            const currentName = draftNames[cat.slug] ?? cat.name;
            const currentKeywords =
              draftKeywords[cat.slug] ?? cat.keywords.join(', ');
            const isSaving = savingSlug === cat.slug;

            return (
              <div
                key={cat.slug}
                className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-12 lg:items-center"
              >
                <div className="lg:col-span-3 space-y-1">
                  <label
                    htmlFor={`name-${cat.slug}`}
                    className="block font-mono text-xs text-slate-500"
                  >
                    biblioteca/{cat.slug} · {cat.itemCount}{' '}
                    {cat.itemCount === 1 ? 'item' : 'itens'}
                  </label>
                  <input
                    id={`name-${cat.slug}`}
                    type="text"
                    value={currentName}
                    onChange={(e) =>
                      setDraftNames((prev) => ({
                        ...prev,
                        [cat.slug]: e.target.value,
                      }))
                    }
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="lg:col-span-6 space-y-1">
                  <label
                    htmlFor={`kw-${cat.slug}`}
                    className="block text-xs text-slate-500"
                  >
                    Palavras-chave de roteamento automático
                  </label>
                  <input
                    id={`kw-${cat.slug}`}
                    type="text"
                    value={currentKeywords}
                    onChange={(e) =>
                      setDraftKeywords((prev) => ({
                        ...prev,
                        [cat.slug]: e.target.value,
                      }))
                    }
                    placeholder="Separadas por vírgula..."
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 lg:col-span-3 lg:pt-5">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleSaveCategory(cat)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? 'Salvando...' : 'Salvar Regras'}
                  </button>

                  {cat.itemCount === 0 && categories.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteCategory(cat.slug)}
                      aria-label={`Remover pasta ${cat.name}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
