import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FolderOpen,
  PackageCheck,
} from 'lucide-react';
import type { DownloadQueueEntry } from '../types';
import { formatBytes } from '../utils/format';

interface QueueViewProps {
  entries: DownloadQueueEntry[];
  onOpenFolder: (categorySlug: string) => void;
  onClearCompleted: () => void;
  onGoExplore: () => void;
}

export function QueueView({
  entries,
  onOpenFolder,
  onClearCompleted,
  onGoExplore,
}: QueueViewProps) {
  const hasCompleted = entries.some((e) => e.status !== 'downloading');

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Fila de Downloads e Organização
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Acompanhe em tempo real cada vídeo baixado e a pasta de categoria em que foi salvo.
          </p>
        </div>

        {hasCompleted && (
          <button
            type="button"
            onClick={onClearCompleted}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Limpar Concluídos
          </button>
        )}
      </section>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <Clock className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            Nenhum download iniciado nesta sessão
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-slate-600">
            Busque um vídeo ou cole um link na aba Explorar Vídeos e clique em Baixar e Organizar para acompanhar o salvamento automático aqui.
          </p>
          <button
            type="button"
            onClick={onGoExplore}
            className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            Ir para Explorar Vídeos
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3.5">Vídeo / Post</th>
                  <th className="px-5 py-3.5">Rede</th>
                  <th className="px-5 py-3.5">Pasta Destino</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Tamanho</th>
                  <th className="px-5 py-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.queueId} className="hover:bg-slate-50/70">
                    <td className="max-w-xs px-5 py-3.5">
                      <p className="font-medium text-slate-900 truncate">{entry.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">
                        {entry.message}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                      {entry.platform}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                      biblioteca/{entry.categorySlug}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {entry.status === 'downloading' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                          <Clock className="h-3.5 w-3.5" />
                          Processando
                        </span>
                      )}
                      {entry.status === 'completed' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          MP4 Salvo
                        </span>
                      )}
                      {entry.status === 'package-only' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
                          <PackageCheck className="h-3.5 w-3.5" />
                          Pacote Organizado
                        </span>
                      )}
                      {entry.status === 'error' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Erro
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {entry.savedItem
                        ? formatBytes(entry.savedItem.videoSizeBytes)
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      {entry.status !== 'error' && entry.status !== 'downloading' && (
                        <button
                          type="button"
                          onClick={() => onOpenFolder(entry.categorySlug)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          Abrir Pasta
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
