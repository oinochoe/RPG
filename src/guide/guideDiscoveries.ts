import { DISCOVERIES, type DiscoveryDef, type DiscoveryReward, type Requirement, type ZoneName } from '../components/game/discoveries';
import { zoneAt } from '../components/game/discoveryZones';

export type RevealStage = 0 | 1 | 2 | 3;

export const ZONE_LABEL: Record<ZoneName, string> = {
  village: '마을 주변',
  desert: '사막',
  fairy: '요정의 숲',
  orc: '오크 마을',
  bone: '뼈의 들판',
  ghoul: '구울 평원',
  field: '들판',
};

const CLASS_NAME: Record<string, string> = { warrior: '전사', archer: '궁수', mage: '마법사' };

export interface GuideDiscovery {
  id: string;
  name: string;
  zone: ZoneName;
  zoneLabel: string;
  hidden: boolean;
  hasReward: boolean;
  hint: string;
  where: string;
  coords: string;
  conditions: string[];
  reward: string | null;
  chainPrev: string | null;
}

export function roundedCoords(pos: [number, number], step = 10): string {
  const r = (n: number) => Math.round(n / step) * step;
  return `x≈${r(pos[0])}, z≈${r(pos[1])}`;
}

export function describeRequirement(req: Requirement, nameOf: (id: string) => string): string {
  switch (req.type) {
    case 'level':
      return `레벨 ${req.min} 이상`;
    case 'seen':
      return `'${nameOf(req.id)}'를 먼저 볼 것`;
    case 'zone':
      return `${ZONE_LABEL[req.zone]} 안에서만`;
  }
}

export function describeReward(r: DiscoveryReward): string {
  const parts: string[] = [];
  if (r.gold) parts.push(`골드 ${r.gold}`);
  if (r.xp) parts.push(`경험치 ${r.xp}`);
  if (r.itemByClass && r.itemNameByClass) {
    const per = (Object.keys(r.itemNameByClass) as (keyof typeof r.itemNameByClass)[]).map((c) => `${CLASS_NAME[c as string] ?? c} ${r.itemNameByClass![c]}`);
    parts.push(`${per.join(' / ')} x${r.itemQty ?? 1}`);
  } else if (r.itemTemplateId !== undefined) {
    parts.push(`${r.itemName ?? '아이템'} x${r.itemQty ?? 1}`);
  }
  return parts.join(' · ');
}

export function buildGuideDiscoveries(defs: readonly DiscoveryDef[] = DISCOVERIES, zone: (x: number, z: number) => string = zoneAt): GuideDiscovery[] {
  const nameById = new Map(defs.map((d) => [d.id, d.name]));
  const nameOf = (id: string) => nameById.get(id) ?? id;
  return defs.map((d) => {
    const z = zone(d.position[0], d.position[1]) as ZoneName;
    const prev = (d.requires ?? []).find((r): r is Extract<Requirement, { type: 'seen' }> => r.type === 'seen');
    return {
      id: d.id,
      name: d.name,
      zone: z,
      zoneLabel: ZONE_LABEL[z] ?? String(z),
      hidden: d.hidden === true,
      hasReward: d.reward !== undefined,
      hint: d.hint ?? '',
      where: d.where ?? '',
      coords: roundedCoords(d.position),
      conditions: (d.requires ?? []).map((r) => describeRequirement(r, nameOf)),
      reward: d.reward ? describeReward(d.reward) : null,
      chainPrev: prev?.id ?? null,
    };
  });
}

/** Groups by zone (in a fixed order) and orders each group so a prerequisite comes before what depends on it. */
export function groupByZone(list: readonly GuideDiscovery[]): { zone: ZoneName; label: string; items: GuideDiscovery[] }[] {
  const order = Object.keys(ZONE_LABEL) as ZoneName[];
  return order
    .map((zone) => ({ zone, label: ZONE_LABEL[zone], items: sortChain(list.filter((d) => d.zone === zone)) }))
    .filter((g) => g.items.length > 0);
}

function sortChain(items: GuideDiscovery[]): GuideDiscovery[] {
  const out: GuideDiscovery[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>(); // a cycle or self-reference must not recurse forever
  const ids = new Set(items.map((i) => i.id));
  const place = (item: GuideDiscovery) => {
    if (placed.has(item.id) || visiting.has(item.id)) return;
    visiting.add(item.id);
    const prev = item.chainPrev && ids.has(item.chainPrev) ? items.find((i) => i.id === item.chainPrev) : undefined;
    if (prev) place(prev);
    visiting.delete(item.id);
    placed.add(item.id);
    out.push(item);
  };
  items.forEach(place);
  return out;
}

export function initialStage(item: GuideDiscovery): RevealStage {
  return item.hidden ? 0 : 2;
}

/** A chained discovery's location opens only after its predecessor's answer was revealed. */
export function canRevealWhere(item: GuideDiscovery, stages: Record<string, RevealStage>): boolean {
  if (!item.chainPrev) return true;
  return (stages[item.chainPrev] ?? 0) >= 3;
}
