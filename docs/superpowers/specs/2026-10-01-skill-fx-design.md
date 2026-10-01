# 스킬 이펙트(Skill FX) 설계

날짜: 2026-10-01 · 선행: `2026-09-30-combat-feel-design.md` (타격감, 배포 완료)

## 목표

스킬 12개가 서로 다르게 보이게 한다. 클래스별 개성(검기 베기 / 빛 화살 궤적 / 불·얼음·운석)을 살리고,
각성기(필살의 일격·폭풍의 화살·메테오)와 광역기는 한 단계 더 크고 화려하게 한다.
코드로만 만든다(지오메트리·셰이더·파티클, 3D 에셋 없음). 폰에서도 부담이 없어야 한다.

성공 기준:
- 12개 스킬을 이펙트만 보고 구분할 수 있다. 각성기는 일반 스킬보다 확실히 크다.
- 게임 규칙(데미지, 쿨타임, MP, 서버 경제)은 한 줄도 바뀌지 않는다.
- 새 스킬 추가 = 정의 한 줄(+ 필요하면 부품 하나).
- 동시 이펙트에 상한이 있고, 폰에서 연속 시전해도 프레임이 눈에 띄게 떨어지지 않는다.

## 범위 밖

- 새 사운드(기존 `swing`/`cast`/`hit`/`hitHeavy` 그대로).
- 스킬 규칙 변경, 3D 모델/외부 에셋.
- 몬스터 쪽 스킬(보스 패턴)의 이펙트 — 기존 `PlayerCombatEffects`의 `Sparkles` 그대로.

## 현재 구조 (확인됨)

- 스킬 정의는 `combatStore.SKILLS_BY_CLASS` (`SkillDef`: id, type `single|aoe`, `aoeRadius`, `fxColor` …).
- 시전 시각 효과는 `CharacterMesh.tsx` 안에 있다: `handleAttackResult`가 `spawnSkillEffect`('flash' 시전 위치 / 'impact' 타격 위치)와 `spawnSkillRing`(광역)을 호출하고, 원거리는 `pendingProjectile` → `Projectile`(도착 시 impact/ring)을 쓴다.
- 모든 스킬이 같은 스프라이트(`flare_01.png`, `impact_01.png`)와 링을 쓰고 `fxColor`만 다르다.
- 타격감 시스템(`combatFx.ts`)이 이미 HP 손실을 `HitEvent`로 발행하고, 스파크 풀(`SparkPool`), 히트스톱, 흔들림이 있다.

## 설계

### 1. 시전 이벤트 `skillFx` 버스

`CharacterMesh.handleAttackResult`의 스킬 분기(시전 순간, 그리고 원거리 투사체 도착 순간)에서 한 번씩 발행한다:

```ts
interface SkillCastEvent {
  skillId: number;
  phase: 'cast' | 'impact';
  from: [number, number, number];   // 시전자(손/가슴 높이)
  to: [number, number, number];     // 대상 위치(타격 높이)
  aoeRadius?: number;
}
subscribeSkillCast(fn): unsubscribe; emitSkillCast(e): void;   // 구독자 예외는 삼킨다
```

`CharacterMesh`에 남는 것은 "이벤트 발행"뿐이다. 기존 `spawnSkillEffect`/`spawnSkillRing`/`SkillRingEffect` 상태는 제거한다(단계적으로 대체 후).

### 2. 이펙트 정의 (데이터)

`SKILL_FX: Record<number, SkillFxDef>` — 스킬 id별. 정의는 단계(phase)마다 부품 목록:

```ts
interface FxPart { kind: PartKind; color: number; scale?: number; delayMs?: number; count?: number; /* 부품별 옵션 */ }
interface SkillFxDef { tier: 'normal' | 'awakening'; cast: FxPart[]; impact: FxPart[]; shake?: number }
```

- 색은 **hex 숫자**(three.js 재질 규칙: CSS 변수 금지). 기존 `fxColor`(문자열)는 폴백으로만 쓴다.
- `tier: 'awakening'`이면 부품이 더 크고, 충돌 순간 추가 흔들림(`addShake`)과 `heavy` 스파크 버스트를 더한다.
- 정의가 없는 스킬 id는 기존과 비슷한 기본 이펙트(flash + impact 스파크)로 대체한다(미래 스킬이 안 보이는 일이 없게).

### 3. 부품 (코드 생성, 공유 지오메트리/재질)

| 부품 | 모양 | 비고 |
|---|---|---|
| `slashArc` | 초승달 호(링 일부) + 알파 페이드 셰이더, 휘두르는 방향으로 회전 | 전사 |
| `trail` | 시전자→대상 사이 길쭉한 빛줄기, 앞에서 뒤로 사라짐 | 궁수/마법사 |
| `orb` | 발광 구체(+ 작은 꼬리), 시전자→대상 이동 | 마법사 |
| `shockwave` | 땅에서 퍼지는 링 + 중심 번쩍임 | 광역(기존 `SkillRing` 대체) |
| `pillar` | 위로 솟는 원기둥 + 세로 그라데이션, 가산 혼합 | 각성기/블리자드 |
| `fall` | 하늘(대상 위)에서 대상으로 낙하하는 물체 + 착지 시 콜백 | 메테오/폭풍의 화살 |
| `sparks` | 기존 `SparkPool` 재사용(색·개수·속도만 다름) | 전부 |
| `flash` | 기존 빌보드 스프라이트(`FxSprite`) | 시전 순간 |

모든 부품은 "수명 동안 진행도 t(0..1)로 매 프레임 갱신 후 자동 제거"되는 같은 형태(`update(t)`)를 따른다. 진행도 계산·수명 처리는 순수 함수로 분리해 테스트한다. 지오메트리·재질은 모듈 단위로 한 번만 만들고 재사용한다(재질의 `opacity`/`color`는 인스턴스별 복제 대신 mesh별 `userData`가 아니라 per-part material clone을 쓰되 풀에서 재사용).

### 4. 스킬별 구성

| 스킬 | cast | impact | 비고 |
|---|---|---|---|
| 강타 (1) | flash | slashArc(대형) + sparks(heavy) | |
| 연속베기 (4) | slashArc ×2 (60ms 간격, 반대 방향) | sparks 소 | |
| 대지진동 (5) | flash | shockwave(aoeRadius) + sparks(흙색) | 광역 |
| 필살의 일격 (10) | pillar(붉은색) + slashArc(특대) | shockwave + sparks(대) | **각성**, shake |
| 관통사격 (2) | trail(긴) | sparks + 작은 flash | |
| 속사 (6) | trail ×3 (40ms 간격, 짧게) | sparks 소 | |
| 산탄사격 (7) | trail ×3 부채꼴 | shockwave(aoeRadius) + sparks | 광역 |
| 폭풍의 화살 (11) | flash | fall(화살 다수, 대상 주변 무작위) + shockwave | **각성**, 광역, shake |
| 파이어볼 (3) | orb(주황) | sparks(화염) + shockwave 소 + flash | |
| 매직미사일 (8) | orb ×3(작게, 40ms 간격) | sparks 소 | |
| 블리자드 (9) | flash(청백) | pillar(하늘색) + shockwave + sparks(얼음 파편) | 광역 |
| 메테오 (12) | flash | fall(운석) → shockwave(특대) + sparks(대) + pillar | **각성**, 광역, shake |

색(hex)은 정의 파일에서 스킬별로 정한다(기존 `fxColor` 팔레트를 기준으로 하되 hex 숫자). 수치(스케일, 지연)는 구현 중 Playwright 스크린샷으로 조정한다.

### 5. `SkillFxRoot`

씬에 한 번 마운트. `subscribeSkillCast`로 받아 정의대로 부품 인스턴스를 만든다.
- **동시 상한** `MAX_ACTIVE_PARTS = 24`(부품 기준; 스킬 1회가 여러 부품을 만들 수 있음). 초과 시 가장 오래된 부품을 제거하고 새 것을 만든다.
- 각 부품은 자기 수명이 끝나면 스스로 제거 → 실패해도 게임을 막지 않는다.
- `fall`/`orb`처럼 도착이 있는 부품이 도착하면 `phase:'impact'` 부품을 이어서 만든다(필요 시).
- 원거리의 투사체 도착 시점은 기존 `CharacterMesh` 흐름(`pendingProjectile`/`Projectile.onArrive`)에서 `phase:'impact'` 이벤트를 발행해 맞춘다. 기존 `Projectile`(화살/볼트 모양)은 `cast` 단계의 `trail`/`orb`로 대체되는 스킬에서는 숨기고, 평타에서는 그대로 쓴다.

### 6. 성능 원칙

- `pointLight` 추가 금지. 발광은 `toneMapped={false}` + 기존 Bloom.
- 지오메트리는 모듈 상수, 재질은 부품 종류별 풀에서 가져와 재사용(스킬 시전마다 `new` 하지 않음).
- 부품 상한 24, 투명도 정렬 비용을 줄이려 `depthWrite={false}`.
- 파티클은 기존 `SparkPool` 하나를 공유한다(풀 크기 96 유지, 필요하면 128로 확대 — 풀 크기 변경은 구현 중 측정 후 판단).

### 7. 파일 구성

신규:
- `src/components/game/skillFx.ts` — `SkillCastEvent` 버스(`emitSkillCast`/`subscribeSkillCast`)
- `src/components/game/skillFxDefs.ts` — `SKILL_FX` 정의(12개) + 기본 폴백
- `src/components/game/skillFxParts.tsx` — 부품 컴포넌트(공유 지오메트리/재질)
- `src/components/game/skillFxLife.ts` — 수명/진행도/상한 정리 순수 로직
- `src/components/game/SkillFxRoot.tsx` — 구독 + 부품 렌더/관리

수정:
- `CharacterMesh.tsx` — 스킬 분기에서 `emitSkillCast` 발행, 기존 인라인 이펙트 제거
- `FxSprite.tsx` — `SkillRing` 제거(shockwave로 대체), `FxSprite`는 `flash` 부품이 사용
- `Scene.tsx` — `<SkillFxRoot />` 마운트
- `HANDOFF.md`, 이 스펙

### 8. 오류 처리·테스트

- 이벤트 구독자 예외는 버스가 삼키고 `console.error`. 이펙트 실패가 전투를 막지 않는다.
- vitest: 버스 발행/구독/해제·예외 격리, 정의 12개가 전부 존재하고 모든 부품 `kind`가 유효·색이 hex 숫자임, 정의 없는 id의 폴백, 수명/진행도 계산, 동시 상한(초과 시 오래된 것 제거), 기존 `var(--` 가드 유지.
- Playwright로 12개 스킬 각각의 스크린샷(데스크톱 + 폰 뷰포트)과 콘솔 오류 확인. 스킬 시전은 개발 서버에서 `emitSkillCast`를 직접 호출해 재현한다.
- 실기기 성능은 자동화로 검증 불가 — 배포 후 확인 요청.

### 9. 구현 순서 (계획 단계에서 세분화)

1. 버스 + 정의 타입 + 수명/상한 로직 + 테스트
2. 부품 몇 개(`slashArc`, `shockwave`, `sparks`, `flash`) + `SkillFxRoot` + 전사 스킬 4종 + CharacterMesh 연결(전사 경로)
3. 궁수 부품(`trail`) + 스킬 4종 (원거리 도착 타이밍 포함)
4. 마법사 부품(`orb`, `pillar`, `fall`) + 스킬 4종
5. 각성기 연출 강화(흔들림·특대 부품), 기존 인라인 이펙트와 `SkillRing` 제거
6. 12개 스킬 시각 확인(데스크톱/폰), HANDOFF 갱신, 배포
