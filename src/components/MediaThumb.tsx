import { useState } from 'react';
import { Film } from 'lucide-react';

interface MediaThumbProps {
  src?: string;
  alt: string;
  platform: string;
  duration?: string;
  className?: string;
}

export function MediaThumb({
  src,
  alt,
  platform,
  duration,
  className = '',
}: MediaThumbProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-slate-100 border-b border-slate-200 ${className}`}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 px-4 text-center">
          <Film className="h-7 w-7 text-slate-400" strokeWidth={1.6} />
          <span className="text-xs font-medium text-slate-500 truncate max-w-full">
            {platform}
          </span>
        </div>
      )}

      {duration && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end bg-gradient-to-t from-black/65 via-black/20 to-transparent p-2.5">
          <span className="font-mono text-xs font-medium text-white tabular-nums">
            {duration}
          </span>
        </div>
      )}
    </div>
  );
}
