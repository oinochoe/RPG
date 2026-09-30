# 전투 타격감 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 평타·스킬·피격·사망에 히트스톱, 카메라 흔들림, 피격 플래시, 타격 스파크, 통합 데미지 숫자를 붙여 타격감을 만든다.

**Architecture:** `combatStore`의 HP 변화를 구독(diff)하는 워처가 `HitEvent`를 만들어 작은 이벤트 버스(`combatFx.ts`)로 발행하고, 연출 모듈(카메라 흔들림·몬스터 반응·스파크 풀·데미지 숫자)이 각자 구독한다. 게임 규칙 코드(`combatStore` 로직, 서버)는 수정하지 않는다.

**Tech Stack:** React 18, @react-three/fiber v8, drei v9, three 0.167, zustand, vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-30-combat-feel-design.md`

## 스펙과 달라진 점 (구현 근거)

- **발행 지점:** 스펙은 `CharacterMesh`/`PlayerCombatEffects`에서 발행한다고 했으나, AoE는 타겟별 데미지가 `AttackResult`에 없고 몬스터→플레이어 피격도 여러 경로라서, **`combatStore` HP 감소를 diff하는 워처 한 곳**에서 발행한다. 결과는 동일한 `HitEvent`이고 발행 코드가 한곳이라 더 단순하다.
- **원거리 타이밍:** 궁수/마법사는 데미지가 즉시 적용되고 투사체는 뒤늦게 도착한다. `CharacterMesh`가 `setHitLeadMs()`로 "투사체 도착까지 시간"을 알려 주면 워처가 몬스터 대상 이벤트를 그만큼 늦춰 발행한다(플레이어 피격은 지연 없음).
- **사망 슬로모션 삭제:** 전역 timeScale은 모든 `useFrame`의 delta를 건드려야 해서 위험 대비 이득이 작다. 사망 연출은 큰 스파크 + 흔들림 + 그 몬스터의 히트스톱으로 한다.
- **강타 기준:** `damage > attackPower * 1.25` (평타는 0.8~1.2배 범위이므로 스킬 배율이 1.25를 넘으면 강타).

## Global Constraints

- three.js 재질·라이트 색에는 CSS 변수(`var(--...)`)를 쓰지 않는다. hex만. (`engage.test.ts`의 가드 테스트가 검사)
- `pointLight` 추가 금지. 발광은 `toneMapped={false}` + 기존 Bloom.
- 새 파일의 주석·커밋 메시지는 기존 코드 스타일(영어 주석, 한글 커밋 메시지)을 따른다.
- 커밋 메시지 끝: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- 작업은 워크트리에서 하고(메모리 규칙: 추적 파일을 제자리 수정 금지), 마지막에 `git push origin HEAD:main`.
- 파티클 풀 크기 96, 동시 데미지 숫자 상한 12.

## Review Focus

- AoE가 여러 몬스터를 동시에 맞힘 → 몬스터마다 이벤트 1개씩 나와야 한다. (Task 1 테스트)
- HP가 **늘어나는** 변화(리스폰, 물약, 지역 전환으로 몬스터 목록 교체) → 이벤트 없음. 새로 나타난/사라진 몬스터도 무시. (Task 1)
- 흔들림 설정을 끄면 오프셋 0. 저장소(localStorage)가 막혀도 기본값으로 동작. (Task 1)
- 구독자 하나가 예외를 던져도 다른 구독자와 게임이 멈추지 않는다. (Task 1)
- 한 프레임에 타격이 96개보다 많이 몰려도 풀이 가장 오래된 슬롯을 재사용하고 예외 없음. (Task 4)
- 플래시 중 몬스터가 사라지거나 컴포넌트가 언마운트돼도 재질이 원복되고 예외 없음. (Task 3)
- 같은 GLTF를 공유하는 다른 몬스터가 함께 번쩍이면 안 된다(재질 공유). (Task 3)

---

### Task 1: 이벤트 버스, 강타 판정, diff, 흔들림 상태, 설정

**Files:**
- Create: `src/components/game/fxSettings.ts`
- Create: `src/components/game/combatFx.ts`
- Test: `src/components/game/combatFx.test.ts`

**Interfaces:**
- Produces (`fxSettings.ts`): `useFxSettings` (zustand) with `{ shake: boolean; setShake(on: boolean): void }`. 기본 `true`. 키 `rpg.fx.shake`.
- Produces (`combatFx.ts`):
  - `type HitKind = 'hit' | 'kill' | 'playerHit'`
  - `interface HitEvent { kind: HitKind; position: [number, number, number]; damage: number; heavy: boolean; targetId?: number }`
  - `subscribeHit(fn: (e: HitEvent) => void): () => void`, `emitHit(e: HitEvent): void`
  - `isHeavyHit(damage: number, attackPower: number): boolean`
  - `diffHits(prev: FxState, next: FxState, playerPos: [number, number, number]): HitEvent[]`
  - `shakeAmplitude(e: HitEvent): number`, `addShake(amp: number): void`, `sampleShake(dt: number, rand?: () => number): { x: number; y: number }`, `resetShake(): void`
  - `setHitLeadMs(ms: number): void`, `startCombatFxWatcher(): () => void`

- [ ] **Step 1: 설정 스토어 작성**

`src/components/game/fxSettings.ts`:

```ts
import { create } from 'zustand';

const SHAKE_KEY = 'rpg.fx.shake';

function readShake(): boolean {
  try {
    return typeof localStorage === 'undefined' ? true : localStorage.getItem(SHAKE_KEY) !== '0';
  } catch {
    // Storage blocked (private mode etc.): default to on.
    return true;
  }
}

interface FxSettingsState {
  shake: boolean;
  setShake: (on: boolean) => void;
}

/** Player-facing switches for combat presentation. Screen shake can be turned off (motion sickness). */
export const useFxSettings = create<FxSettingsState>((set) => ({
  shake: readShake(),
  setShake: (on) => {
    try {
      localStorage.setItem(SHAKE_KEY, on ? '1' : '0');
    } catch {
      // best-effort
    }
    set({ shake: on });
  },
}));
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/components/game/combatFx.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addShake,
  diffHits,
  emitHit,
  isHeavyHit,
  resetShake,
  sampleShake,
  shakeAmplitude,
  subscribeHit,
  type HitEvent,
} from './combatFx';
import { useFxSettings } from './fxSettings';

const m = (currentHp: number, x = 0) => ({ currentHp, alive: currentHp > 0, position: [x, 0, 0] as [number, number, number] });
const state = (playerHp: number, monsters: Record<number, ReturnType<typeof m>>, attackPower = 10) => ({
  player: { currentHp: playerHp, attackPower },
  monsters,
});
const P: [number, number, number] = [0, 1, 0];

describe('isHeavyHit', () => {
  it('treats a plain attack (0.8-1.2x) as normal and a skill multiplier above 1.25x as heavy', () => {
    expect(isHeavyHit(12, 10)).toBe(false);
    expect(isHeavyHit(13, 10)).toBe(true);
  });
});

describe('diffHits', () => {
  it('emits one event per monster that lost HP (AoE)', () => {
    const prev = state(50, { 1: m(30), 2: m(30), 3: m(30) });
    const next = state(50, { 1: m(20), 2: m(10), 3: m(30) });
    const events = diffHits(prev, next, P);
    expect(events.map((e) => [e.targetId, e.damage, e.kind])).toEqual([
      [1, 10, 'hit'],
      [2, 20, 'hit'],
    ]);
  });

  it('marks a monster reaching 0 HP as a heavy kill', () => {
    const [e] = diffHits(state(50, { 1: m(5) }), state(50, { 1: m(0) }), P);
    expect(e).toMatchObject({ kind: 'kill', damage: 5, heavy: true, targetId: 1 });
  });

  it('emits playerHit when the player loses HP, at the player position', () => {
    const [e] = diffHits(state(50, {}), state(42, {}), P);
    expect(e).toMatchObject({ kind: 'playerHit', damage: 8, position: [0, 1, 0] });
  });

  it('ignores HP increases, and monsters that appear or disappear', () => {
    const prev = state(40, { 1: m(10), 2: m(10) });
    const next = state(50, { 1: m(30), 3: m(1) }); // healed / respawned; 2 gone; 3 new
    expect(diffHits(prev, next, P)).toEqual([]);
  });

  it('places the event above the monster, at chest height', () => {
    const [e] = diffHits(state(50, { 1: m(30, 4) }), state(50, { 1: m(20, 4) }), P);
    expect(e.position[0]).toBe(4);
    expect(e.position[1]).toBeGreaterThan(0.5);
  });
});

describe('event bus', () => {
  it('delivers to every subscriber and stops after unsubscribe', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeHit(a);
    subscribeHit(b);
    const e: HitEvent = { kind: 'hit', position: [0, 0, 0], damage: 1, heavy: false };
    emitHit(e);
    offA();
    emitHit(e);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('keeps delivering when one subscriber throws', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    subscribeHit(() => {
      throw new Error('boom');
    });
    subscribeHit(good);
    expect(() => emitHit({ kind: 'hit', position: [0, 0, 0], damage: 1, heavy: false })).not.toThrow();
    expect(good).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('screen shake', () => {
  beforeEach(() => {
    resetShake();
    useFxSettings.setState({ shake: true });
  });

  it('gives no shake to a plain hit, some to heavy/kill/player hits, most to a kill', () => {
    const base = { position: [0, 0, 0] as [number, number, number], damage: 1 };
    expect(shakeAmplitude({ ...base, kind: 'hit', heavy: false })).toBe(0);
    const heavy = shakeAmplitude({ ...base, kind: 'hit', heavy: true });
    const player = shakeAmplitude({ ...base, kind: 'playerHit', heavy: false });
    const kill = shakeAmplitude({ ...base, kind: 'kill', heavy: true });
    expect(heavy).toBeGreaterThan(0);
    expect(player).toBeGreaterThan(0);
    expect(kill).toBeGreaterThan(heavy);
  });

  it('decays to zero and never exceeds the cap', () => {
    addShake(100);
    const first = sampleShake(0.016, () => 1);
    expect(Math.abs(first.x)).toBeLessThanOrEqual(0.3);
    let last = first;
    for (let i = 0; i < 60; i++) last = sampleShake(0.016, () => 1);
    expect(last).toEqual({ x: 0, y: 0 });
  });

  it('is exactly zero when the player turned shake off', () => {
    useFxSettings.setState({ shake: false });
    addShake(0.2);
    expect(sampleShake(0.016, () => 1)).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/components/game/combatFx.test.ts`
Expected: FAIL — `./combatFx` 모듈을 찾을 수 없음.

- [ ] **Step 4: `combatFx.ts` 구현**

```ts
import { useCombatStore } from '../../stores/combatStore';
import { playerPosition } from './playerTransform';
import { useFxSettings } from './fxSettings';

// Combat presentation is decoupled from combat rules: combatStore decides damage, this module only
// watches the HP it leaves behind and turns each loss into a HitEvent. Feel modules (camera shake,
// monster flash/hit-stop, sparks, damage numbers) subscribe and never touch the store.

export type HitKind = 'hit' | 'kill' | 'playerHit';

export interface HitEvent {
  kind: HitKind;
  position: [number, number, number];
  damage: number;
  heavy: boolean;
  targetId?: number;
}

// A basic attack rolls 0.8-1.2x of attackPower; anything above this is a skill-sized blow.
const HEAVY_RATIO = 1.25;
const CHEST_HEIGHT = 0.9;

export function isHeavyHit(damage: number, attackPower: number): boolean {
  return damage > attackPower * HEAVY_RATIO;
}

interface FxMonster {
  currentHp: number;
  position: [number, number, number];
}
export interface FxState {
  player: { currentHp: number; attackPower: number };
  monsters: Record<number, FxMonster>;
}

/** Every HP loss between two store states, as events. Gains and appearing/vanishing monsters are ignored. */
export function diffHits(prev: FxState, next: FxState, playerPos: [number, number, number]): HitEvent[] {
  const events: HitEvent[] = [];
  for (const key of Object.keys(next.monsters)) {
    const id = Number(key);
    const before = prev.monsters[id];
    const after = next.monsters[id];
    if (!before || after.currentHp >= before.currentHp) continue;
    const damage = before.currentHp - after.currentHp;
    const killed = after.currentHp <= 0;
    events.push({
      kind: killed ? 'kill' : 'hit',
      position: [after.position[0], after.position[1] + CHEST_HEIGHT, after.position[2]],
      damage,
      heavy: killed || isHeavyHit(damage, next.player.attackPower),
      targetId: id,
    });
  }
  if (next.player.currentHp < prev.player.currentHp) {
    events.push({ kind: 'playerHit', position: playerPos, damage: prev.player.currentHp - next.player.currentHp, heavy: false });
  }
  return events;
}

const listeners = new Set<(e: HitEvent) => void>();

export function subscribeHit(fn: (e: HitEvent) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitHit(e: HitEvent): void {
  for (const fn of [...listeners]) {
    try {
      fn(e);
    } catch (err) {
      // A presentation bug must never stall combat or starve the other listeners.
      console.error('[combatFx] listener failed', err);
    }
  }
}

// --- screen shake -----------------------------------------------------------------------------

const MAX_SHAKE = 0.3; // world units; ~10 units fit across the screen
const SHAKE_DECAY_PER_SEC = 14;
let shakeAmp = 0;

export function shakeAmplitude(e: HitEvent): number {
  if (e.kind === 'kill') return 0.16;
  if (e.kind === 'playerHit') return 0.12;
  return e.heavy ? 0.08 : 0;
}

export function addShake(amp: number): void {
  shakeAmp = Math.min(MAX_SHAKE, shakeAmp + amp);
}

export function resetShake(): void {
  shakeAmp = 0;
}

/** Camera offset for this frame (world units). Advances and decays the shake. */
export function sampleShake(dt: number, rand: () => number = Math.random): { x: number; y: number } {
  if (!useFxSettings.getState().shake) {
    shakeAmp = 0;
    return { x: 0, y: 0 };
  }
  shakeAmp *= Math.exp(-dt * SHAKE_DECAY_PER_SEC);
  if (shakeAmp < 0.002) {
    shakeAmp = 0;
    return { x: 0, y: 0 };
  }
  return { x: (rand() * 2 - 1) * shakeAmp, y: (rand() * 2 - 1) * shakeAmp };
}

// --- store watcher ----------------------------------------------------------------------------

// A ranged class's damage lands in the store instantly but its projectile arrives later; monster
// events wait this long so sparks/flash line up with the visible impact. CharacterMesh sets it.
let hitLeadMs = 0;
export function setHitLeadMs(ms: number): void {
  hitLeadMs = ms;
}

/** Start turning combatStore HP losses into HitEvents. Returns the stop function. */
export function startCombatFxWatcher(): () => void {
  let prev = useCombatStore.getState() as FxState;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const unsubscribe = useCombatStore.subscribe((state) => {
    const next = state as FxState;
    const events = diffHits(prev, next, [playerPosition.x, 1, playerPosition.z]);
    prev = next;
    for (const e of events) {
      if (e.kind === 'playerHit' || hitLeadMs <= 0) {
        emitHit(e);
        continue;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        emitHit(e);
      }, hitLeadMs);
      timers.add(timer);
    }
  });
  return () => {
    unsubscribe();
    timers.forEach(clearTimeout);
    timers.clear();
  };
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/components/game/combatFx.test.ts && npx tsc -b`
Expected: PASS (모든 테스트), tsc 오류 없음. (`useCombatStore.getState() as FxState`가 타입 오류를 내면 `MonsterCombatState.position`이 튜플인지 확인 — 튜플이므로 통과해야 함.)

- [ ] **Step 6: 커밋**

```bash
git add src/components/game/fxSettings.ts src/components/game/combatFx.ts src/components/game/combatFx.test.ts
git commit -m "feat(combat-fx): 전투 연출 이벤트 버스와 HP 변화 워처, 강타 판정, 화면 흔들림 상태

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 워처 연결, 카메라 흔들림, 원거리 지연, 설정 토글

**Files:**
- Create: `src/components/game/CombatFxRoot.tsx`
- Modify: `src/components/game/Scene.tsx` (CameraRig 근처, ~line 227 / PlayerCombatEffects ~line 278)
- Modify: `src/components/game/CameraRig.tsx`
- Modify: `src/components/game/CharacterMesh.tsx` (원거리 지연 등록)
- Modify: `src/components/game/SystemMenu.tsx` (토글 버튼)

**Interfaces:**
- Consumes: `startCombatFxWatcher`, `subscribeHit`, `addShake`, `shakeAmplitude`, `sampleShake`, `setHitLeadMs` (Task 1), `useFxSettings`.
- Produces: `<CombatFxRoot />` — 씬에 한 번 마운트. 이후 Task 4/5의 `<HitSparks />`, `<DamageNumbers />`를 이 안에 넣는다.

- [ ] **Step 1: `CombatFxRoot.tsx` 작성**

```tsx
import { useEffect } from 'react';
import { addShake, shakeAmplitude, startCombatFxWatcher, subscribeHit } from './combatFx';

/** Mount once inside the Canvas: starts the HP watcher and hosts the combat-feel visuals. */
export function CombatFxRoot() {
  useEffect(() => {
    const stopWatcher = startCombatFxWatcher();
    const stopShake = subscribeHit((e) => {
      const amp = shakeAmplitude(e);
      if (amp > 0) addShake(amp);
    });
    return () => {
      stopShake();
      stopWatcher();
    };
  }, []);
  return null;
}
```

- [ ] **Step 2: Scene에 마운트**

`Scene.tsx`에서 `import { PlayerCombatEffects } from './PlayerCombatEffects';` 아래에 `import { CombatFxRoot } from './CombatFxRoot';`를 추가하고, `<PlayerCombatEffects fieldMonsters={fieldMonsters} />` 바로 다음 줄에 `<CombatFxRoot />`를 추가한다.

- [ ] **Step 3: CameraRig에 흔들림 적용**

`CameraRig.tsx`: `import { sampleShake } from './combatFx';` 추가. `useFrame` 본문을 아래로 교체(카메라 위치 lerp 상태를 `baseRef`로 분리해 흔들림이 추적 상태에 누적되지 않게 한다).

```tsx
  const baseRef = useRef<THREE.Vector3 | null>(null);

  useFrame((_, delta) => {
    const cam = camRef.current;
    if (!cam) return;
    const base = (baseRef.current ??= cam.position.clone());
    const followSpeed = Math.min(1, delta * 4);
    const desiredPos = new THREE.Vector3(playerPosition.x, playerPosition.y, playerPosition.z).add(OFFSET);
    base.lerp(desiredPos, followSpeed);
    lookTarget.current.lerp(
      new THREE.Vector3(playerPosition.x, playerPosition.y + 1, playerPosition.z),
      followSpeed,
    );
    // Shake is a pure translation of camera and look target, so the view never tilts.
    const shake = sampleShake(delta);
    cam.position.set(base.x + shake.x, base.y + shake.y, base.z);
    cam.lookAt(lookTarget.current.x + shake.x, lookTarget.current.y + shake.y, lookTarget.current.z);
  });
```

(기존 `cam.position.lerp(desiredPos, followSpeed); ... cam.lookAt(lookTarget.current);` 를 위 코드로 대체. `cameraZoomFor` 등 다른 export는 그대로.)

- [ ] **Step 4: 원거리 지연 등록 (CharacterMesh)**

`CharacterMesh.tsx`에서 `import { setHitLeadMs } from './combatFx';` 추가. 컴포넌트 본문(다른 `useEffect`들 근처)에 추가:

```tsx
  // Ranged damage lands in the store at once but the projectile arrives later; tell the combat-fx
  // watcher so its sparks/flash/numbers line up with the visible impact.
  useEffect(() => {
    setHitLeadMs(PROJECTILE_VARIANT[character.character_class] ? RANGED_DRAW_DURATION_MS + PROJECTILE_DURATION_MS : 0);
    return () => setHitLeadMs(0);
  }, [character.character_class]);
```

`PROJECTILE_VARIANT`, `RANGED_DRAW_DURATION_MS`, `PROJECTILE_DURATION_MS`가 모듈 상수인지 `grep -n "RANGED_DRAW_DURATION_MS\|PROJECTILE_DURATION_MS\|PROJECTILE_VARIANT" src/components/game/CharacterMesh.tsx`로 확인하고, 이름이 다르면 실제 이름을 쓴다. `useEffect`가 import 되어 있지 않으면 react import에 추가.

- [ ] **Step 5: SystemMenu 토글**

`SystemMenu.tsx`: `import { useFxSettings } from "./fxSettings";` 추가. 컴포넌트 상단에서 `const shake = useFxSettings((s) => s.shake); const setShake = useFxSettings((s) => s.setShake);`. "게임 방법 (도움말)" 버튼 위(같은 `flex flex-col gap-2` 안)에 추가:

```tsx
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setShake(!shake)}>
          화면 흔들림 {shake ? "켜짐" : "꺼짐"}
        </Button>
```

훅은 `if (!isOpen) return null;` **앞**에 호출해야 한다(규칙 위반 방지).

- [ ] **Step 6: 검증**

Run: `npx tsc -b && npx vitest run`
Expected: 오류 없음, 전체 통과.

- [ ] **Step 7: 커밋**

```bash
git add src/components/game/CombatFxRoot.tsx src/components/game/Scene.tsx src/components/game/CameraRig.tsx src/components/game/CharacterMesh.tsx src/components/game/SystemMenu.tsx
git commit -m "feat(combat-fx): 카메라 흔들림과 원거리 타이밍 보정, 흔들림 끄기 설정

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 몬스터 피격 플래시와 히트스톱

**Files:**
- Create: `src/components/game/hitReaction.ts`
- Test: `src/components/game/hitReaction.test.ts`
- Modify: `src/components/game/MonsterMesh.tsx` (두 본체 컴포넌트: 스켈레톤 ~line 313, 일반 ~line 444)

**Interfaces:**
- Consumes: `subscribeHit`, `HitEvent` (Task 1).
- Produces: `createFlash(root: THREE.Object3D): { flash(ms: number): void; dispose(): void }` — 첫 `flash` 때 이 인스턴스의 재질을 복제해 다른 몬스터와 분리한다. `useHitReaction(targetId: number, root: THREE.Object3D, mixer: THREE.AnimationMixer): void`.

- [ ] **Step 1: 실패하는 테스트**

`src/components/game/hitReaction.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFlash } from './hitReaction';

function model(shared: THREE.MeshToonMaterial) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared));
  const outline = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  outline.userData.isOutline = true;
  root.add(outline);
  return { root, body: root.children[0] as THREE.Mesh, outline };
}

describe('createFlash', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lights the body up, then restores its emissive', () => {
    const { root, body } = model(new THREE.MeshToonMaterial());
    const f = createFlash(root);
    f.flash(60);
    expect((body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0xffffff);
    vi.advanceTimersByTime(61);
    expect((body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0x000000);
  });

  it('does not touch the material shared with other instances of the same model', () => {
    const shared = new THREE.MeshToonMaterial();
    const a = model(shared);
    const b = model(shared);
    createFlash(a.root).flash(60);
    expect(shared.emissive.getHex()).toBe(0x000000);
    expect((b.body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0x000000);
    expect(a.body.material).not.toBe(shared);
  });

  it('leaves outline meshes alone', () => {
    const { root, outline } = model(new THREE.MeshToonMaterial());
    const before = outline.material;
    createFlash(root).flash(60);
    expect(outline.material).toBe(before);
  });

  it('a second flash restarts the timer instead of stacking', () => {
    const { root, body } = model(new THREE.MeshToonMaterial());
    const f = createFlash(root);
    f.flash(60);
    vi.advanceTimersByTime(40);
    f.flash(60);
    vi.advanceTimersByTime(40);
    expect((body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0xffffff);
    vi.advanceTimersByTime(30);
    expect((body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0x000000);
  });

  it('dispose restores at once and a pending timer cannot fire afterwards', () => {
    const { root, body } = model(new THREE.MeshToonMaterial());
    const f = createFlash(root);
    f.flash(60);
    f.dispose();
    expect((body.material as THREE.MeshToonMaterial).emissive.getHex()).toBe(0x000000);
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
  });

  it('ignores materials without an emissive channel', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    expect(() => createFlash(root).flash(60)).not.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/game/hitReaction.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `hitReaction.ts` 구현**

```ts
import { useEffect } from 'react';
import * as THREE from 'three';
import { subscribeHit } from './combatFx';

const FLASH_MS = 70;
const HIT_STOP_MS = 60;
const KILL_HIT_STOP_MS = 90;
// Not zero: a fully frozen mixer looks like a crash; a crawl reads as impact weight.
const HIT_STOP_SCALE = 0.05;

interface Glow {
  material: THREE.Material & { emissive: THREE.Color };
  original: THREE.Color;
}

/**
 * White flash on a model. Materials come from the shared, cached GLTF, so the first flash gives this
 * instance its own copies — otherwise every monster of the kind would light up together.
 */
export function createFlash(root: THREE.Object3D): { flash: (ms: number) => void; dispose: () => void } {
  let glows: Glow[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function collect(): Glow[] {
    const found: Glow[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.isOutline) return;
      const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        if (!(m as THREE.MeshToonMaterial).emissive) return m;
        const copy = m.clone() as THREE.MeshToonMaterial;
        found.push({ material: copy, original: copy.emissive.clone() });
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? own : own[0];
    });
    return found;
  }

  function restore() {
    glows?.forEach((g) => g.material.emissive.copy(g.original));
  }

  return {
    flash(ms) {
      glows ??= collect();
      glows.forEach((g) => g.material.emissive.set(0xffffff));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        restore();
      }, ms);
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      restore();
    },
  };
}

/** Flash + hit-stop for one monster whenever a HitEvent targets it. */
export function useHitReaction(targetId: number, root: THREE.Object3D, mixer: THREE.AnimationMixer): void {
  useEffect(() => {
    const flash = createFlash(root);
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeHit((e) => {
      if (e.targetId !== targetId || e.kind === 'playerHit') return;
      flash.flash(FLASH_MS);
      if (!e.heavy) return;
      mixer.timeScale = HIT_STOP_SCALE;
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        stopTimer = null;
        mixer.timeScale = 1;
      }, e.kind === 'kill' ? KILL_HIT_STOP_MS : HIT_STOP_MS);
    });
    return () => {
      off();
      if (stopTimer) clearTimeout(stopTimer);
      mixer.timeScale = 1;
      flash.dispose();
    };
  }, [targetId, root, mixer]);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/game/hitReaction.test.ts`
Expected: PASS (6개).

- [ ] **Step 5: MonsterMesh 연결**

`MonsterMesh.tsx`에 `import { useHitReaction } from './hitReaction';` 추가. 두 본체 컴포넌트에서 `const { actions } = useAnimations(...)`를 `const { actions, mixer } = useAnimations(...)`로 바꾸고, 각각 그 다음 줄에 추가:

```tsx
  useHitReaction(combat.instanceId, scene, mixer);
```

(`combat`은 각 본체의 prop이며 `combat.instanceId`가 있다 — `MonsterCombatState.instanceId`. `scene`은 각 컴포넌트에서 `cloneSkeleton(...)`한 인스턴스 씬이다. 두 컴포넌트 모두에서 변수명이 `scene`인지 확인하고 다르면 맞춘다.)

- [ ] **Step 6: 검증 및 커밋**

Run: `npx tsc -b && npx vitest run`
Expected: 통과.

```bash
git add src/components/game/hitReaction.ts src/components/game/hitReaction.test.ts src/components/game/MonsterMesh.tsx
git commit -m "feat(combat-fx): 몬스터 피격 플래시와 강타·사망 히트스톱

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 타격 스파크 파티클 풀

**Files:**
- Create: `src/components/game/sparkPool.ts`
- Test: `src/components/game/sparkPool.test.ts`
- Create: `src/components/game/HitSparks.tsx`
- Modify: `src/components/game/CombatFxRoot.tsx` (`<HitSparks />` 렌더)

**Interfaces:**
- Produces (`sparkPool.ts`): `class SparkPool { constructor(size: number); readonly size: number; spawn(origin: [number,number,number], count: number, speed: number, life: number, scale: number, color: number, rand?: () => number): void; step(dt: number): void; isAlive(i: number): boolean; readonly x/y/z/scale/color arrays; }` — 링버퍼, 할당 없음.
- Produces (`HitSparks.tsx`): `<HitSparks />`.

- [ ] **Step 1: 실패하는 테스트**

`src/components/game/sparkPool.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SparkPool } from './sparkPool';

const rand = () => 0.5;

function aliveCount(p: SparkPool) {
  let n = 0;
  for (let i = 0; i < p.size; i++) if (p.isAlive(i)) n++;
  return n;
}

describe('SparkPool', () => {
  it('spawns the requested number of sparks at the origin', () => {
    const p = new SparkPool(96);
    p.spawn([2, 1, 3], 8, 3, 0.4, 0.1, 0xffffff, rand);
    expect(aliveCount(p)).toBe(8);
    const i = [...Array(96).keys()].find((k) => p.isAlive(k))!;
    expect(p.x[i]).toBeCloseTo(2);
    expect(p.z[i]).toBeCloseTo(3);
  });

  it('retires sparks after their life', () => {
    const p = new SparkPool(96);
    p.spawn([0, 0, 0], 8, 3, 0.4, 0.1, 0xffffff, rand);
    p.step(0.2);
    expect(aliveCount(p)).toBe(8);
    p.step(0.25);
    expect(aliveCount(p)).toBe(0);
  });

  it('reuses the oldest slots when more sparks are requested than the pool holds', () => {
    const p = new SparkPool(10);
    expect(() => {
      for (let i = 0; i < 5; i++) p.spawn([i, 0, 0], 8, 3, 1, 0.1, 0xffffff, rand);
    }).not.toThrow();
    expect(aliveCount(p)).toBe(10);
  });

  it('pulls sparks down over time', () => {
    const p = new SparkPool(4);
    p.spawn([0, 2, 0], 1, 0, 1, 0.1, 0xffffff, () => 0.5);
    const i = [0, 1, 2, 3].find((k) => p.isAlive(k))!;
    p.step(0.3);
    expect(p.y[i]).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/game/sparkPool.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `sparkPool.ts` 구현**

```ts
// Fixed-size ring buffer of hit sparks in plain typed arrays: spawning reuses the oldest slot, so a
// burst of hits never allocates or grows — what keeps this cheap on phones.
const GRAVITY = 9;
const DRAG_PER_SEC = 4;

export class SparkPool {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly scale: Float32Array;
  readonly color: Uint32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private next = 0;

  constructor(readonly size: number) {
    this.x = new Float32Array(size);
    this.y = new Float32Array(size);
    this.z = new Float32Array(size);
    this.scale = new Float32Array(size);
    this.color = new Uint32Array(size);
    this.vx = new Float32Array(size);
    this.vy = new Float32Array(size);
    this.vz = new Float32Array(size);
    this.age = new Float32Array(size);
    this.life = new Float32Array(size); // 0 = free
  }

  isAlive(i: number): boolean {
    return this.life[i] > 0;
  }

  spawn(
    origin: [number, number, number],
    count: number,
    speed: number,
    life: number,
    scale: number,
    color: number,
    rand: () => number = Math.random,
  ): void {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.size;
      const theta = rand() * Math.PI * 2;
      const lift = 0.3 + rand() * 0.7;
      const s = speed * (0.5 + rand() * 0.5);
      this.x[i] = origin[0];
      this.y[i] = origin[1];
      this.z[i] = origin[2];
      this.vx[i] = Math.cos(theta) * s;
      this.vz[i] = Math.sin(theta) * s;
      this.vy[i] = s * lift;
      this.age[i] = 0;
      this.life[i] = life;
      this.scale[i] = scale;
      this.color[i] = color;
    }
  }

  step(dt: number): void {
    const drag = Math.exp(-DRAG_PER_SEC * dt);
    for (let i = 0; i < this.size; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        continue;
      }
      this.vy[i] -= GRAVITY * dt;
      this.vx[i] *= drag;
      this.vz[i] *= drag;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
    }
  }

  /** 1 at birth, 0 at death — used to shrink a spark as it fades. */
  remaining(i: number): number {
    return this.life[i] > 0 ? 1 - this.age[i] / this.life[i] : 0;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/game/sparkPool.test.ts`
Expected: PASS (4개).

- [ ] **Step 5: `HitSparks.tsx` 작성**

```tsx
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { subscribeHit } from './combatFx';
import { SparkPool } from './sparkPool';

const POOL_SIZE = 96;
const COLOR: Record<'normal' | 'heavy' | 'player', number> = { normal: 0xffffff, heavy: 0xffd54a, player: 0xff5a5a };

/**
 * All hit sparks in one InstancedMesh (one draw call, no lights). Colors are plain hex on purpose:
 * three.js materials cannot resolve CSS variables.
 */
export function HitSparks() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const pool = useMemo(() => new SparkPool(POOL_SIZE), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);

  useEffect(
    () =>
      subscribeHit((e) => {
        if (e.kind === 'playerHit') pool.spawn(e.position, 8, 3.5, 0.35, 0.09, COLOR.player);
        else if (e.kind === 'kill') pool.spawn(e.position, 26, 5.5, 0.55, 0.13, COLOR.heavy);
        else if (e.heavy) pool.spawn(e.position, 14, 4.5, 0.45, 0.11, COLOR.heavy);
        else pool.spawn(e.position, 6, 3.2, 0.3, 0.08, COLOR.normal);
      }),
    [pool],
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    pool.step(Math.min(delta, 0.05));
    for (let i = 0; i < POOL_SIZE; i++) {
      if (pool.isAlive(i)) {
        dummy.position.set(pool.x[i], pool.y[i], pool.z[i]);
        dummy.scale.setScalar(pool.scale[i] * pool.remaining(i));
        tint.setHex(pool.color[i]);
        mesh.setColorAt(i, tint);
      } else {
        dummy.position.set(0, -100, 0);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, POOL_SIZE]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
```

`CombatFxRoot.tsx`: `import { HitSparks } from './HitSparks';`를 추가하고 `return null;`을 `return <HitSparks />;`로 바꾼다.

- [ ] **Step 6: 검증 및 커밋**

Run: `npx tsc -b && npx vitest run`
Expected: 통과 (`engage.test.ts`의 `var(--` 가드 포함).

```bash
git add src/components/game/sparkPool.ts src/components/game/sparkPool.test.ts src/components/game/HitSparks.tsx src/components/game/CombatFxRoot.tsx
git commit -m "feat(combat-fx): 타격 스파크 — InstancedMesh 파티클 풀 하나로

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 데미지 숫자 통합

**Files:**
- Create: `src/components/game/damageNumbers.ts` (순수 로직)
- Test: `src/components/game/damageNumbers.test.ts`
- Create: `src/components/game/DamageNumbers.tsx`
- Modify: `src/components/game/CombatFxRoot.tsx`
- Modify: `src/components/game/MonsterMesh.tsx` (기존 몬스터 팝업 제거)
- Modify: `src/components/game/PlayerCombatEffects.tsx` (기존 "-N" 팝업 제거, 골드 팝업 유지)

**Interfaces:**
- Produces (`damageNumbers.ts`): `interface NumberSpec { text: string; color: string; fontSize: number }`, `numberSpec(e: HitEvent): NumberSpec`, `pushCapped<T>(list: T[], item: T, cap: number): T[]`, `MAX_NUMBERS = 12`.

- [ ] **Step 1: 실패하는 테스트**

`src/components/game/damageNumbers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_NUMBERS, numberSpec, pushCapped } from './damageNumbers';
import type { HitEvent } from './combatFx';

const ev = (over: Partial<HitEvent>): HitEvent => ({ kind: 'hit', position: [0, 0, 0], damage: 7, heavy: false, ...over });

describe('numberSpec', () => {
  it('shows a plain hit small and white', () => {
    expect(numberSpec(ev({}))).toMatchObject({ text: '7', color: '#ffffff' });
  });
  it('shows a heavy hit larger and gold', () => {
    const plain = numberSpec(ev({}));
    const heavy = numberSpec(ev({ heavy: true }));
    expect(heavy.color).toBe('#ffd54a');
    expect(heavy.fontSize).toBeGreaterThan(plain.fontSize);
  });
  it('shows damage taken as a red minus', () => {
    expect(numberSpec(ev({ kind: 'playerHit', damage: 12 }))).toMatchObject({ text: '-12', color: '#ff5a5a' });
  });
});

describe('pushCapped', () => {
  it('drops the oldest entries beyond the cap', () => {
    let list: number[] = [];
    for (let i = 0; i < MAX_NUMBERS + 5; i++) list = pushCapped(list, i, MAX_NUMBERS);
    expect(list).toHaveLength(MAX_NUMBERS);
    expect(list[0]).toBe(5);
    expect(list.at(-1)).toBe(MAX_NUMBERS + 4);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/game/damageNumbers.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `damageNumbers.ts` 구현**

```ts
import type { HitEvent } from './combatFx';

export const MAX_NUMBERS = 12;

export interface NumberSpec {
  text: string;
  color: string;
  fontSize: number;
}

export function numberSpec(e: HitEvent): NumberSpec {
  if (e.kind === 'playerHit') return { text: `-${e.damage}`, color: '#ff5a5a', fontSize: 22 };
  if (e.heavy) return { text: `${e.damage}`, color: '#ffd54a', fontSize: 30 };
  return { text: `${e.damage}`, color: '#ffffff', fontSize: 20 };
}

/** Append and keep only the newest `cap` entries. */
export function pushCapped<T>(list: T[], item: T, cap: number): T[] {
  const next = [...list, item];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/game/damageNumbers.test.ts`
Expected: PASS.

- [ ] **Step 5: `DamageNumbers.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { subscribeHit } from './combatFx';
import { MAX_NUMBERS, numberSpec, pushCapped, type NumberSpec } from './damageNumbers';

const LIFETIME_MS = 700;

interface FloatNumber extends NumberSpec {
  id: number;
  position: [number, number, number];
}

/** Every damage number in the game — monster hits, kills and damage taken — from the HitEvent bus. */
export function DamageNumbers() {
  const [numbers, setNumbers] = useState<FloatNumber[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = subscribeHit((e) => {
      const id = nextId.current++;
      // Small horizontal jitter so numbers from an AoE do not stack exactly on top of each other.
      const jitter = (Math.random() - 0.5) * 0.5;
      const item: FloatNumber = { id, ...numberSpec(e), position: [e.position[0] + jitter, e.position[1] + 0.7, e.position[2]] };
      setNumbers((prev) => pushCapped(prev, item, MAX_NUMBERS));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setNumbers((prev) => prev.filter((n) => n.id !== id));
      }, LIFETIME_MS);
      timers.add(timer);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <>
      {numbers.map((n) => (
        <Html key={n.id} position={n.position} center>
          <div
            className="font-display"
            style={{
              color: n.color,
              fontSize: n.fontSize,
              WebkitTextStroke: '4px var(--color-ink)',
              paintOrder: 'stroke fill',
              pointerEvents: 'none',
              animation: `rpg-dmg-float ${LIFETIME_MS}ms ease-out forwards`,
            }}
          >
            {n.text}
          </div>
        </Html>
      ))}
    </>
  );
}
```

(`rpg-dmg-float` 키프레임은 `index.html`에 이미 있다. DOM 스타일이라 `var(--color-ink)` 사용은 안전하다.)

`CombatFxRoot.tsx`: `import { DamageNumbers } from './DamageNumbers';` 추가, 반환을 `<><HitSparks /><DamageNumbers /></>`로 변경.

- [ ] **Step 6: 기존 팝업 제거**

`MonsterMesh.tsx`:
- `interface DamagePopup {...}` 삭제, `const [popups, setPopups] = useState<DamagePopup[]>([]);` 삭제.
- 데미지 감지 `useEffect(() => { ... combat.currentHp ... }, [combat?.currentHp])` 에서 팝업 생성 블록을 지운다. `prevHpRef`가 다른 곳에서 쓰이지 않으면 ref와 이 effect 전체를 삭제한다(사용처는 `grep -n prevHpRef src/components/game/MonsterMesh.tsx`로 확인).
- JSX 끝의 `{popups.map((popup) => (<Html ...>...</Html>))}` 블록 삭제.
- 더 이상 쓰지 않는 import(`Html`, `useState` 등)를 tsc/eslint 경고에 맞춰 정리한다.

`PlayerCombatEffects.tsx`:
- `useCombatStore.subscribe` 안의 HP 감소 → `pushPopup('-N', ...)` 부분만 삭제한다. **골드 획득 `+NG` 팝업과 `popups` 렌더는 그대로 둔다.** `prevHpRef`는 HP 감소 감지 외에 쓰이지 않으면 함께 삭제.

- [ ] **Step 7: 검증 및 커밋**

Run: `npx tsc -b && npx vitest run && npm run build`
Expected: 통과, 빌드 성공.

```bash
git add src/components/game/damageNumbers.ts src/components/game/damageNumbers.test.ts src/components/game/DamageNumbers.tsx src/components/game/CombatFxRoot.tsx src/components/game/MonsterMesh.tsx src/components/game/PlayerCombatEffects.tsx
git commit -m "feat(combat-fx): 데미지 숫자를 이벤트 버스 하나로 통합 — 강타는 크고 금색, 동시 12개 상한

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 시각 확인, 문서, 배포

**Files:**
- Modify: `HANDOFF.md` (전투 연출 규칙 섹션 추가)
- Modify: `docs/superpowers/specs/2026-09-30-combat-feel-design.md` (구현과 달라진 점 반영)

- [ ] **Step 1: 개발 서버로 시각 확인**

워크트리에서 `npx vite --port 5199`. Playwright(MCP)로 로그인 → 캐릭터 선택 → 슬라임 근처로 순간이동(`playerTransform`에 `playerPosition.x/z` 설정) → 평타·스킬 실행 후 스크린샷을 `.playwright-mcp/`에 저장해 확인한다.
확인 항목: (1) 타격 지점 스파크, (2) 몬스터가 잠깐 하얗게 번쩍임(같은 종류의 다른 몬스터는 그대로), (3) 데미지 숫자가 평타=흰색 작게 / 스킬=금색 크게, (4) 사망 시 큰 스파크, (5) 시스템 메뉴의 "화면 흔들림" 토글, (6) 폰 뷰포트(390×844, `hasTouch/isMobile` 컨텍스트)에서도 동일하게 동작하고 콘솔 오류 없음.
이상이 있으면 해당 Task로 돌아가 고친다.

- [ ] **Step 2: HANDOFF.md 갱신**

전투 연출 섹션을 추가한다: 이벤트 버스 구조(워처 → `HitEvent` → 구독자), 새 연출을 붙일 때는 `subscribeHit`만 쓸 것, three 재질에 CSS 변수 금지, 파티클은 `SparkPool` 재사용·라이트 추가 금지, 원거리 지연은 `setHitLeadMs`, 실기기 성능 미검증 사항.

- [ ] **Step 3: 스펙 갱신**

스펙의 "발행 지점"(워처 diff로 변경), "사망 연출"(전역 슬로모션 삭제) 항목을 이 계획 상단 "스펙과 달라진 점"과 일치하게 고친다.

- [ ] **Step 4: 최종 검증**

Run: `npx tsc -b && npx vitest run && npm run build`
Expected: 모두 통과.

- [ ] **Step 5: 커밋, 푸시, 배포 확인**

```bash
git add HANDOFF.md docs/superpowers/specs/2026-09-30-combat-feel-design.md
git commit -m "docs: 전투 연출 구조와 규칙을 HANDOFF에 기록

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin HEAD:main
```

Vercel 배포 후 `https://www.roleplaying.kr` 200, `/api/health` 200, `https://roleplaying.kr` 308 확인. 워크트리·개발 서버·`.playwright-mcp/*.png` 정리. 사용자에게 폰 실기기 성능 확인을 요청한다.
