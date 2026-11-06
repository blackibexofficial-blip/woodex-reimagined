/**
 * Inline SVG miniatures for the Library cards (CSS/SVG thumbnails — zero raster assets,
 * house tokens only, deterministic per layout kind).
 */
import type { CatalogueCategory } from "./catalogue";

const stroke = "var(--hon-green, #0C5B3F)";
const faint = "#9CA3AF";
const fill = "var(--hon-green-pale, #EAF3ED)";

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 96 64" aria-hidden className="h-full w-full">
      <rect x="0" y="0" width="96" height="64" rx="6" fill="#FFFFFF" />
      <rect x="0.5" y="0.5" width="95" height="63" rx="5.5" fill="none" stroke="#E5E7EB" />
      {children}
    </svg>
  );
}
const bar = (x: number, y: number, w: number, h: number, o = 1, r = 2) => <rect key={`${x}-${y}-${w}`} x={x} y={y} width={w} height={h} rx={r} fill={stroke} opacity={o} />;
const line = (x: number, y: number, w: number, h = 2.5) => <rect key={`l${x}-${y}`} x={x} y={y} width={w} height={h} rx={1.25} fill={faint} />;

const LAYOUTS: Record<CatalogueCategory, React.ReactNode> = {
  hero: <>{bar(34, 16, 28, 6, 1, 3)}{line(24, 28, 48)}{line(30, 34, 36)}<rect x="36" y="44" width="24" height="7" rx="3.5" fill={stroke} /></>,
  features: <>{[0, 1, 2].map((c) => [0, 1].map((r) => <rect key={`${c}${r}`} x={8 + c * 30} y={10 + r * 24} width="24" height="18" rx="3" fill={fill} stroke={stroke} strokeOpacity="0.35" />))}</>,
  pricing: <>{[0, 1, 2].map((c) => <g key={c}><rect x={6 + c * 31} y="10" width="26" height="44" rx="3" fill={fill} stroke={stroke} strokeOpacity="0.35" /><rect x={11 + c * 31} y="16" width="16" height="3.5" rx="1.75" fill={stroke} opacity={c === 1 ? 1 : 0.55} /><line x1={11 + c * 31} y1={26} x2="21" y2={26} width="16" /><line x1={11 + c * 31} y1={33} x2="21" y2={33} width="16" /></g>)}</>,
  stats: <>{[18, 32, 24, 44].map((h, i) => <rect key={i} x={10 + i * 21} y={48 - h} width="13" height={h} rx="2" fill={stroke} opacity={0.55 + i * 0.12} />)}</>,
  testimonials: <>{[0, 1].map((c) => <g key={c}><rect x={10 + c * 40} y="12" width="32" height="30" rx="3" fill={fill} /><line x1={16 + c * 40} y1={20} x2="26" y2={20} width="20" /><line x1={16 + c * 40} y1={27} x2="20" y2={27} width="14" /></g>)}<line x1="14" y1="50" x2="38" y2="50" width="24" /></>,
  team: <>{[0, 1, 2].map((c) => <g key={c}><circle cx={18 + c * 30} cy="24" r="9" fill={fill} stroke={stroke} strokeOpacity="0.4" /><line x1={10 + c * 30} y1="44" x2="26" y2="44" width="16" /></g>)}</>,
  cta: <>{bar(18, 18, 60, 6, 1, 3)}<line x1="28" y1="30" x2="40" y2="30" width="40" /><rect x="30" y="40" width="36" height="8" rx="4" fill={stroke} /></>,
  content: <><line x1="10" y1="14" x2="30" y2="14" width="76" /><line x1="10" y1="22" x2="20" y2="22" width="76" /><line x1="10" y1="30" x2="14" y2="30" width="76" /><line x1="10" y1="38" x2="22" y2="38" width="60" /></>,
  forms: <><rect x="18" y="10" width="60" height="7" rx="3.5" fill="none" stroke={faint} /><rect x="18" y="21" width="60" height="7" rx="3.5" fill="none" stroke={faint} /><rect x="18" y="32" width="60" height="10" rx="3.5" fill="none" stroke={faint} /><rect x="30" y="46" width="36" height="7" rx="3.5" fill={stroke} /></>,
  components: <>{[0, 1, 2, 3].map((c) => <rect key={c} x={6 + c * 23} y="24" width="18" height="14" rx="3" fill={fill} stroke={stroke} strokeOpacity="0.35" />)}</>,
};

export default function SectionThumb({ category, className }: { category: CatalogueCategory; className?: string }) {
  return (
    <div className={className} role="img" aria-label={`${category} section preview`}>
      <Glyph>{LAYOUTS[category]}</Glyph>
    </div>
  );
}
