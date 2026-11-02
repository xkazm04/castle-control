/**
 * Words the art director and the library search share: named games and franchises become
 * descriptive style language (never a name, logo or character), and loose moods map to a theme.
 */
export const franchises: readonly { pattern: RegExp; style: string }[] = [
  { pattern: /\bvalorant\b/gi, style: 'tactical graphic sci-fi with clean agent-tech shapes' },
  { pattern: /\belden ?ring\b/gi, style: 'gilded dark fantasy with weathered gold and ancient stone' },
  { pattern: /\bdark ?souls\b|\bsouls ?like\b/gi, style: 'grimdark ember gothic with ash and worn iron' },
  { pattern: /\bfortnite\b/gi, style: 'bright stylized battle-arena colours' },
  { pattern: /\bminecraft\b/gi, style: 'blocky voxel craft' },
  { pattern: /\bapex( legends)?\b/gi, style: 'frontier tactical sci-fi' },
  { pattern: /\boverwatch\b/gi, style: 'clean heroic hero-tech sci-fi' },
  { pattern: /\bdiablo\b/gi, style: 'gothic infernal hellfire' },
  { pattern: /\bdestiny\b/gi, style: 'golden polyhedral sci-fi relic' },
  { pattern: /\bhalo\b|\bforerunner\b/gi, style: 'ancient hard-light megastructure tech' },
  { pattern: /\bhollow ?knight\b/gi, style: 'subterranean soul-lantern gloom' },
  { pattern: /\bworld of warcraft\b|\bwow\b/gi, style: 'heroic high-fantasy raid' },
  { pattern: /\bleague of legends\b|\blol\b/gi, style: 'arcane arena gold' },
  { pattern: /\bbaldur'?s gate\b/gi, style: 'amethyst gothic dark fantasy' },
  { pattern: /\bmonster hunter\b/gi, style: 'rugged hunter craft with bone and leather' },
  { pattern: /\bsea of thieves\b/gi, style: 'stylized buccaneer fantasy' },
  { pattern: /\bgame of thrones\b/gi, style: 'medieval war-table' },
  { pattern: /\bcivilization\b|\bciv\b/gi, style: 'imperial cartographic' },
  { pattern: /\btron\b/gi, style: 'neon grid' },
  { pattern: /\bcyberpunk 2077\b/gi, style: 'cyberpunk' },
  { pattern: /\bpokemon\b|\bpokémon\b/gi, style: 'bright creature-collector toy style' },
  { pattern: /\bzelda\b/gi, style: 'storybook heroic fantasy' },
  { pattern: /\bmario\b|\bnintendo\b/gi, style: 'bright playful platformer' },
];

/** The request with every named franchise replaced by descriptive style words. */
export function translate(request: string): { text: string; named: boolean } {
  let named = false;
  let text = request;
  for (const { pattern, style } of franchises) text = text.replace(pattern, () => { named = true; return style; });
  return { text: text.replace(/\s+/g, ' ').trim(), named };
}

export type Theme = {
  id: string; words: readonly string[]; style_name: string; palette: readonly string[];
  materials: string; lighting: string;
};

export const halloween = 'Hallowed Night: candlelit gothic Halloween — carved jack-o-lantern glow, black wrought iron, '
  + 'bone and wax details, drifting wisps, deep violet-black with ember orange and sickly green accents, '
  + 'painterly AAA game key-art finish, eerie but stream-friendly (no gore).';

export const themes: readonly Theme[] = [
  { id: 'halloween', words: ['halloween', 'spooky', 'pumpkin', 'hallowed'], style_name: 'Hallowed Night Gothic',
    palette: ['#1A1024', '#FF8A24', '#B85CFF', '#78F044'], materials: halloween, lighting: 'candlelit ember glow with eerie green rim light' },
  { id: 'cyber', words: ['cyberpunk', 'cyber', 'neon', 'hud', 'synthwave', 'tron', 'grid', 'glitch'], style_name: 'Neon Gunmetal Tech',
    palette: ['#0B0F1A', '#00E5FF', '#FF2BD6', '#FFD43B'], materials: 'dark gunmetal panels, glass tubes, exposed cabling', lighting: 'hot neon edge light with cyan and magenta bloom' },
  { id: 'fire', words: ['fire', 'lava', 'flame', 'hell', 'infernal', 'ember', 'volcanic', 'hellfire'], style_name: 'Forged Volcanic Ember',
    palette: ['#1A0E0A', '#FF651A', '#FFD23F', '#7A1E12'], materials: 'black obsidian, cracked magma seams, forged iron bands', lighting: 'molten orange glow from within, heat haze' },
  { id: 'ice', words: ['ice', 'frozen', 'frost', 'winter', 'snow', 'glacial'], style_name: 'Glacial Citadel',
    palette: ['#0E1A2B', '#7FD8FF', '#E8F6FF', '#3A6EA5'], materials: 'carved blue ice, frosted silver filigree', lighting: 'cold rim light with a soft inner glow' },
  { id: 'nature', words: ['cozy', 'nature', 'druid', 'plants', 'wood', 'forest', 'farm', 'harvest', 'botanical'], style_name: 'Cozy Botanical Oak',
    palette: ['#2B1D12', '#7BAE4E', '#E8B04A', '#F3E2C0'], materials: 'warm oak, moss, leaves and brass fittings', lighting: 'soft golden-hour light' },
  { id: 'space', words: ['space', 'sci', 'scifi', 'orbital', 'station', 'visor', 'helmet', 'galaxy', 'astral'], style_name: 'Clean Orbital Tech',
    palette: ['#0A1020', '#25DFFF', '#E6ECF5', '#FFB52E'], materials: 'white composite panels, brushed titanium, glass', lighting: 'cool studio key light with cyan accents' },
  { id: 'pixel', words: ['pixel', 'retro', 'arcade', '8-bit', '8bit', '16-bit', 'voxel', 'blocky'], style_name: '16-Bit Arcade',
    palette: ['#14112A', '#FF4D6D', '#3DDCFF', '#FFE14D'], materials: 'chunky crisp pixel shapes with limited palette', lighting: 'flat bright arcade light with hard shadows' },
  { id: 'cute', words: ['cute', 'pastel', 'vtuber', 'kawaii', 'soft', 'anime'], style_name: 'Pastel Jewel',
    palette: ['#2A1F3D', '#FF8CC6', '#9FE8E0', '#FFE08A'], materials: 'glossy pastel enamel, rounded gems, soft gold trim', lighting: 'soft dreamy glow with sparkles' },
  { id: 'steampunk', words: ['steampunk', 'clockwork', 'gears', 'brass', 'victorian'], style_name: 'Clockwork Aether',
    palette: ['#1E140C', '#C8893A', '#6FD3C4', '#E9D8B4'], materials: 'aged brass, copper pipes, gears and riveted leather', lighting: 'warm lamp light with teal aether glow' },
  { id: 'pirate', words: ['pirate', 'buccaneer', 'sea', 'ship', 'sailing'], style_name: 'Buccaneer Fantasy',
    palette: ['#14202A', '#C9963D', '#2FB5A8', '#E8DCC0'], materials: 'weathered ship timber, rope, tarnished gold', lighting: 'lantern light over sea-green shadows' },
  { id: 'norse', words: ['viking', 'norse', 'runes', 'rune', 'nordic'], style_name: 'Runeforged Iron',
    palette: ['#151A1F', '#36E6C5', '#B47A3C', '#D9DEE3'], materials: 'hammered iron, ironwood, carved glowing runes', lighting: 'cold daylight with teal rune glow' },
  { id: 'luxury', words: ['gold', 'fancy', 'luxury', 'casino', 'premium', 'royal', 'deco', 'vip'], style_name: 'Art Deco Gold',
    palette: ['#120E0A', '#D4AF37', '#F5E6B8', '#7A1E2C'], materials: 'polished gold, black lacquer, velvet and crystal', lighting: 'glamorous key light with gold highlights' },
  { id: 'clean', words: ['minimal', 'clean', 'esports', 'sleek', 'glass', 'simple', 'modern'], style_name: 'Precision Esports',
    palette: ['#0D1117', '#00D9FF', '#FF4DCE', '#E6EDF3'], materials: 'smoked glass, matte carbon, thin chamfered metal', lighting: 'crisp studio light with a fine accent edge' },
  { id: 'racing', words: ['racing', 'carbon', 'motorsport', 'speed', 'car'], style_name: 'Motorsport Carbon',
    palette: ['#0E0F12', '#FF3B30', '#E6E8EC', '#FFC400'], materials: 'woven carbon fibre, anodised aluminium, rubber', lighting: 'hard track-day light with sharp reflections' },
  { id: 'storm', words: ['storm', 'stormy', 'lightning', 'thunder', 'hype', 'electric'], style_name: 'Stormforged',
    palette: ['#0B1022', '#6FB7FF', '#E9F2FF', '#B07CFF'], materials: 'dark steel and storm glass with arcing filaments', lighting: 'crackling electric blue light' },
  { id: 'tactical', words: ['tactical', 'military', 'milsim', 'shooter', 'fps', 'agent'], style_name: 'Tactical Alloy',
    palette: ['#14181D', '#35E6DD', '#FF535F', '#C8CDD3'], materials: 'matte polymer, machined alloy, hazard markings', lighting: 'cool overhead light with a teal accent' },
  { id: 'gothic', words: ['dark', 'gothic', 'horror', 'grimdark', 'occult', 'souls', 'fantasy', 'reliquary', 'medieval', 'stone', 'iron'],
    style_name: 'Gothic Ember Reliquary', palette: ['#14100E', '#D49B38', '#8E2C2C', '#BFB6A8'], materials: 'worn black iron, carved stone, aged gold', lighting: 'low candle and ember light' },
  { id: 'arcane', words: ['magic', 'crystal', 'arcane', 'mmo', 'mystic', 'dragon', 'wizard', 'relic'], style_name: 'Arcane Crystal Relic',
    palette: ['#141127', '#7B42F6', '#38F2E6', '#D9B45A'], materials: 'polished crystal, silver filigree, enchanted stone', lighting: 'luminous violet and cyan inner glow' },
];
/** The house look when the request names no mood: the app's own forged-iron heraldry. */
export const default_theme: Theme = { id: 'house', words: [], style_name: 'Forged Arcane Steel',
  palette: ['#1B1F2A', '#3A445E', '#D49B38', '#00E5FF'], materials: 'forged dark steel, brass inlays, engraved panels', lighting: 'moody key light with a bright accent glow' };

const colours: Record<string, string> = {
  black: '#0B0B0F', white: '#F2F2F2', red: '#E5383B', crimson: '#B0172E', orange: '#FF8A24', gold: '#D4AF37', yellow: '#FFD43B',
  green: '#3DDC84', teal: '#14B8A6', cyan: '#00E5FF', blue: '#3B82F6', navy: '#14213D', purple: '#8B5CF6', violet: '#7B42F6',
  pink: '#FF4DA6', magenta: '#FF2BD6', silver: '#C0C6CF', grey: '#6B7280', gray: '#6B7280',
};

/** Lowercase words of a request, without filler. */
export function words(text: string): string[] {
  const filler = new Set(['a', 'an', 'the', 'and', 'or', 'it', 'its', 'my', 'me', 'for', 'of', 'to', 'with', 'like', 'but', 'not', 'pls',
    'please', 'make', 'look', 'some', 'something', 'thing', 'kind', 'style', 'vibe', 'vibes', 'feel', 'in', 'on', 'is', 'be', 'that', 'this']);
  return text.toLowerCase().split(/[^a-z0-9#-]+/).filter(word => word.length > 1 && !filler.has(word));
}

export function pickTheme(text: string): Theme {
  const said = new Set(words(text));
  let best = default_theme;
  let score = 0;
  for (const theme of themes) {
    const hits = theme.words.filter(word => said.has(word) || (word.includes('-') && text.toLowerCase().includes(word))).length;
    if (hits > score) { best = theme; score = hits; }
  }
  return best;
}

/** Brand colours the streamer named ("teal and black"), in the order said. */
export function namedColours(text: string): string[] {
  return [...new Set(words(text).map(word => colours[word]).filter((value): value is string => value !== undefined))];
}
