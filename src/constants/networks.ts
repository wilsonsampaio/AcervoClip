export interface SocialNetworkDefinition {
  id: string;
  label: string;
  group:
    | 'principais'
    | 'comunidades'
    | 'streaming'
    | 'descentralizadas'
    | 'universal';
  domainHints: string[];
}

export const SOCIAL_NETWORKS: SocialNetworkDefinition[] = [
  { id: 'todas', label: 'Todas as Redes Sociais', group: 'universal', domainHints: [] },
  // Principais & Vídeos Curtos
  { id: 'youtube', label: 'YouTube & Shorts', group: 'principais', domainHints: ['youtube.com', 'youtu.be'] },
  { id: 'tiktok', label: 'TikTok', group: 'principais', domainHints: ['tiktok.com'] },
  { id: 'instagram', label: 'Instagram Reels', group: 'principais', domainHints: ['instagram.com'] },
  { id: 'facebook', label: 'Facebook Watch & Reels', group: 'principais', domainHints: ['facebook.com', 'fb.watch'] },
  { id: 'threads', label: 'Threads', group: 'principais', domainHints: ['threads.net', 'threads.com'] },
  { id: 'kwai', label: 'Kwai', group: 'principais', domainHints: ['kwai.com', 'kuaishou.com'] },
  { id: 'snapchat', label: 'Snapchat Spotlight', group: 'principais', domainHints: ['snapchat.com'] },
  { id: 'pinterest', label: 'Pinterest Vídeo', group: 'principais', domainHints: ['pinterest.com', 'pin.it'] },
  { id: 'lemon8', label: 'Lemon8', group: 'principais', domainHints: ['lemon8-app.com'] },

  // Comunidades, Microblog & Profissional
  { id: 'x', label: 'X (Twitter)', group: 'comunidades', domainHints: ['x.com', 'twitter.com'] },
  { id: 'reddit', label: 'Reddit', group: 'comunidades', domainHints: ['reddit.com', 'redd.it'] },
  { id: 'bluesky', label: 'Bluesky', group: 'comunidades', domainHints: ['bsky.app'] },
  { id: 'linkedin', label: 'LinkedIn Vídeo', group: 'comunidades', domainHints: ['linkedin.com'] },
  { id: 'telegram', label: 'Telegram Canais (t.me)', group: 'comunidades', domainHints: ['t.me', 'telegram.me'] },
  { id: 'vk', label: 'VK Vídeo', group: 'comunidades', domainHints: ['vk.com', 'vkvideo.ru'] },
  { id: 'farcaster', label: 'Farcaster / Warpcast', group: 'comunidades', domainHints: ['warpcast.com', 'farcaster.xyz'] },

  // Streaming, Clipes & Vídeo Longo
  { id: 'twitch', label: 'Twitch Clipes & VODs', group: 'streaming', domainHints: ['twitch.tv'] },
  { id: 'kick', label: 'Kick Clipes', group: 'streaming', domainHints: ['kick.com'] },
  { id: 'vimeo', label: 'Vimeo', group: 'streaming', domainHints: ['vimeo.com'] },
  { id: 'dailymotion', label: 'Dailymotion', group: 'streaming', domainHints: ['dailymotion.com', 'dai.ly'] },
  { id: 'rumble', label: 'Rumble', group: 'streaming', domainHints: ['rumble.com'] },
  { id: 'odysee', label: 'Odysee / LBRY', group: 'streaming', domainHints: ['odysee.com'] },
  { id: 'bilibili', label: 'Bilibili', group: 'streaming', domainHints: ['bilibili.com', 'b23.tv'] },

  // Descentralizadas, Fediverso & Acervos
  { id: 'mastodon', label: 'Mastodon / Fediverso', group: 'descentralizadas', domainHints: ['mastodon.social', 'mastodon.online', 'bolha.us', 'fosstodon.org'] },
  { id: 'peertube', label: 'PeerTube (Fediverso Vídeo)', group: 'descentralizadas', domainHints: ['framatube.org', 'tilvids.com', 'peertube.tv'] },
  { id: 'archive', label: 'Acervo Aberto (.MP4 direto)', group: 'descentralizadas', domainHints: ['archive.org'] },

  // Rede personalizada / desconhecida
  { id: 'custom', label: 'Outra Rede / Domínio Personalizado...', group: 'universal', domainHints: [] },
];

export const NETWORK_GROUP_LABELS: Record<SocialNetworkDefinition['group'], string> = {
  universal: 'Busca Global ou Personalizada',
  principais: 'Principais & Vídeos Curtos',
  comunidades: 'Comunidades, Microblog & Profissional',
  streaming: 'Streaming, Clipes & Vídeo Longo',
  descentralizadas: 'Fediverso, Descentralizadas & Acervo',
};
