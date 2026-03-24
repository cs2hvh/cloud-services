// TLD catalogue data — no emoji, category icons are rendered by consumers via Lucide

export const MAX_TLDS = 20;

export interface TldCategory {
  id: string;
  label: string;
  /** Lucide icon name resolved by the consumer. Kept as a string key to avoid
   *  importing the full icon set here. */
  iconKey: string;
  tlds: string[];
}

export const TLD_CATEGORIES: TldCategory[] = [
  {
    id: 'popular',
    label: 'Popular',
    iconKey: 'Star',
    tlds: ['com', 'net', 'org', 'info', 'biz', 'co'],
  },
  {
    id: 'tech',
    label: 'Tech & AI',
    iconKey: 'Cpu',
    tlds: ['io', 'ai', 'app', 'dev', 'tech', 'cloud', 'digital', 'network', 'software', 'run', 'build', 'code', 'systems', 'host'],
  },
  {
    id: 'shop',
    label: 'Shop & Commerce',
    iconKey: 'ShoppingBag',
    tlds: ['shop', 'store', 'market', 'boutique', 'deals', 'sale', 'buy', 'fashion', 'jewelry', 'clothing'],
  },
  {
    id: 'creative',
    label: 'Creative & Media',
    iconKey: 'Palette',
    tlds: ['design', 'art', 'studio', 'media', 'gallery', 'photo', 'photography', 'film', 'tv', 'fm', 'live', 'video', 'show', 'stream'],
  },
  {
    id: 'business',
    label: 'Business',
    iconKey: 'Briefcase',
    tlds: ['pro', 'agency', 'consulting', 'services', 'solutions', 'company', 'group', 'management', 'inc', 'ltd', 'llc', 'partners'],
  },
  {
    id: 'gaming',
    label: 'Gaming',
    iconKey: 'Gamepad2',
    tlds: ['gg', 'game', 'games', 'play', 'esports'],
  },
  {
    id: 'community',
    label: 'Community',
    iconKey: 'Users',
    tlds: ['social', 'community', 'club', 'team', 'blog', 'news', 'wiki', 'chat', 'link', 'page', 'press', 'events'],
  },
  {
    id: 'other',
    label: 'Other',
    iconKey: 'Globe',
    tlds: ['xyz', 'site', 'online', 'website', 'me', 'guru', 'expert', 'ninja', 'rocks', 'zone', 'today', 'world', 'global', 'tools', 'tips', 'support', 'email', 'life'],
  },
];

export interface TldPreset {
  id: string;
  label: string;
  iconKey: string;
  tlds: string[];
}

export const TLD_PRESETS: TldPreset[] = [
  { id: 'tech',     label: 'Tech Stack',   iconKey: 'Cpu',         tlds: ['com', 'io', 'ai', 'app', 'dev', 'tech', 'cloud'] },
  { id: 'shop',     label: 'Shop Pack',    iconKey: 'ShoppingBag', tlds: ['com', 'shop', 'store', 'market', 'co', 'net'] },
  { id: 'business', label: 'Business',     iconKey: 'Briefcase',   tlds: ['com', 'co', 'biz', 'pro', 'agency', 'solutions', 'services'] },
  { id: 'gaming',   label: 'Gaming',       iconKey: 'Gamepad2',    tlds: ['com', 'gg', 'game', 'games', 'io', 'live'] },
  { id: 'creative', label: 'Creative',     iconKey: 'Palette',     tlds: ['com', 'design', 'art', 'studio', 'media', 'co'] },
  { id: 'global',   label: 'Global',       iconKey: 'Globe',       tlds: ['com', 'net', 'org', 'co', 'me', 'world', 'global'] },
];
