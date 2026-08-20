import { normalizeSearch } from "../reconciliation";

/** Generic, public destination motifs. These are illustrative shapes, not
 * branded or copyrighted marks, and never reference private trip data. */
export type DestinationMotif =
  | "liberty"
  | "ruins-peak"
  | "volcano"
  | "rooster"
  | "tower"
  | "colosseum"
  | "torii"
  | "pyramid"
  | "palm"
  | "maple"
  | "clocktower"
  | "opera-house"
  | "northern-lights"
  | "safari"
  | "windmill"
  | "cathedral";

/** Keyword -> motif gazetteer. Longest keyword wins so "new york city" beats
 * a shorter partial match. Keywords are generic place names only. */
const DESTINATION_KEYWORDS: Array<{ motif: DestinationMotif; keywords: string[] }> = [
  { motif: "liberty", keywords: ["new york", "nyc", "manhattan", "brooklyn", "new york city"] },
  { motif: "ruins-peak", keywords: ["peru", "machu picchu", "cusco", "andes", "inca", "lima"] },
  {
    motif: "volcano",
    keywords: [
      "central america", "costa rica", "guatemala", "nicaragua", "iceland", "hawaii",
      "el salvador", "honduras", "panama", "bali", "maui",
    ],
  },
  { motif: "rooster", keywords: ["portugal", "lisbon", "porto", "algarve", "madeira"] },
  { motif: "tower", keywords: ["paris", "france", "eiffel"] },
  { motif: "colosseum", keywords: ["rome", "italy", "roma", "milan", "venice", "florence", "tuscany"] },
  { motif: "torii", keywords: ["japan", "tokyo", "kyoto", "osaka"] },
  { motif: "pyramid", keywords: ["egypt", "cairo", "giza"] },
  {
    motif: "palm",
    keywords: [
      "mexico", "cancun", "caribbean", "bahamas", "jamaica", "florida",
      "los angeles", "california", "san diego", "miami",
    ],
  },
  { motif: "maple", keywords: ["canada", "toronto", "vancouver", "montreal", "ottawa", "quebec", "banff"] },
  { motif: "clocktower", keywords: ["london", "england", "uk", "united kingdom", "britain", "scotland", "edinburgh"] },
  { motif: "opera-house", keywords: ["sydney", "australia", "melbourne", "brisbane"] },
  { motif: "northern-lights", keywords: ["norway", "finland", "sweden", "lapland", "scandinavia", "arctic"] },
  { motif: "safari", keywords: ["kenya", "tanzania", "safari", "serengeti", "south africa"] },
  { motif: "windmill", keywords: ["netherlands", "amsterdam", "holland"] },
  { motif: "cathedral", keywords: ["spain", "barcelona", "madrid", "seville"] },
];

const SORTED_KEYWORDS = DESTINATION_KEYWORDS
  .flatMap(({ motif, keywords }) => keywords.map((keyword) => ({ motif, keyword: normalizeSearch(keyword) })))
  .sort((a, b) => b.keyword.length - a.keyword.length);

/** Resolves the icon motif for a group: an explicit override always wins,
 * otherwise the group name is matched against the generic gazetteer. */
export function motifForGroup(name: string, explicit?: DestinationMotif): DestinationMotif | null {
  if (explicit) return explicit;
  const normalized = normalizeSearch(name);
  if (!normalized) return null;
  const match = SORTED_KEYWORDS.find((entry) => normalized.includes(entry.keyword));
  return match?.motif ?? null;
}

export const DESTINATION_MOTIFS: DestinationMotif[] = [
  "liberty", "ruins-peak", "volcano", "rooster", "tower", "colosseum", "torii", "pyramid",
  "palm", "maple", "clocktower", "opera-house", "northern-lights", "safari", "windmill", "cathedral",
];
