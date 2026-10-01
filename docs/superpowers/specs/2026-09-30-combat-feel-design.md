# 전투 타격감(Combat Feel) 설계

날짜: 2026-09-30 · 범위: 타격감 (스킬 이펙트 강화는 다음 라운드)

## 목표

맞고 때리는 순간이 손에 감기게 한다. 서풍의 광시곡/템페스트처럼 "때렸다"는 피드백이 즉각적이고 묵직할 것.
코드로만 만든다(파티클·셰이더·카메라 연출, 3D 에셋 없음). 폰에서도 60fps 근처를 유지한다.

성공 기준:
- 평타·스킬·몬스터 피격·몬스터 사망 각각이 시각적으로 구분되고, 강한 공격일수록 더 묵직하다.
- 게임 규칙(데미지 계산, 서버 경제, 드롭)은 한 줄도 바뀌지 않는다. 연출은 결과를 "구경"만 한다.
- 폰에서 동시 다수 타격에도 프레임이 눈에 띄게 떨어지지 않는다.

## 범위 밖

- 실제 크리티컬 확률 시스템 (현재 `combatStore`에 없음, 서버 경제와 얽힘). 대신 **강타 = 스킬 타격 또는 데미지가 큰 타격**을 강조 연출의 기준으로 쓴다.
- 스킬별 고유 이펙트(검기, 폭발, 마법진 등) — 다음 라운드.
- 사운드 신규 제작. 기존 `playSound` 키(`hit`, `hitHeavy`)만 사용.

## 현재 구조 (확인됨)

- 데미지는 `combatStore`에서 즉시 계산. `CharacterMesh.handleAttackResult`가 결과로 스윙/투사체/스킬 스프라이트를 띄움.
- 몬스터 피격 연출은 `MonsterMesh`가 HP 감소를 감지해 DOM(Html) 팝업 + 피격 애니메이션.
- 플레이어 피격은 `PlayerCombatEffects`가 구독으로 "-N" 팝업.
- `CameraRig`는 직교 카메라가 lerp로 플레이어를 추적. 후처리는 Bloom+Vignette.

## 설계

### 1. 이벤트 버스 `combatFx.ts`

`combatStore`의 HP 감소를 diff하는 워처 한 곳에서 이벤트를 발행하고, 연출 모듈들이 구독한다.

```ts
type HitEvent = {
  kind: 'hit' | 'kill' | 'playerHit';
  position: [number, number, number];   // 타격 지점(월드)
  damage: number;
  heavy: boolean;                       // 스킬 타격, 또는 데미지가 임계값 이상
  targetId?: number;                    // 몬스터 instance_id
};
emitHit(event); subscribeHit(fn): unsubscribe;
```

- 발행 지점: `startCombatFxWatcher`(`diffHits`)가 `combatStore` HP 감소를 감지해 몬스터 피격(AoE는 몬스터마다 1개), 몬스터 사망(`kill`), 플레이어 피격을 발행한다. AoE 타겟별 데미지가 `AttackResult`에 없고 몬스터→플레이어 피격 경로가 여러 곳이라 발행 코드를 한곳으로 모았다(`CharacterMesh`/`PlayerCombatEffects`에는 발행 코드가 없다).
- 원거리 클래스는 데미지가 즉시 적용되고 투사체가 늦게 도착하므로, `CharacterMesh`가 `setHitLeadMs()`로 알려 주는 시간만큼 몬스터 대상 이벤트를 늦춰 발행한다.
- `heavy` 판정은 순수 함수 `isHeavyHit(damage, attackPower)`(`damage > attackPower * 1.15`)로 분리해 테스트한다. 사망은 항상 강타.
- 구독자는 React 상태를 거치지 않고 ref/mutable 값을 직접 갱신한다(리렌더 없음).

### 2. 연출 모듈 (각각 독립, 버스만 구독)

| 모듈 | 동작 | 비용 |
|---|---|---|
| 화면 흔들림 (`combatFx.ts`의 `sampleShake`, 구독은 `CombatFxRoot.tsx`) | 감쇠하는 진폭을 유지. `CameraRig`가 매 프레임 `sampleShake`로 카메라 위치에 더함. 강도: 평타 0(생략), 강타 작게, 플레이어 피격 중간, 사망 큼 | 값 2개 |
| 히트스톱 (`hitReaction.ts`) | 강타/사망 시 대상 몬스터의 애니메이션 mixer `timeScale`을 40~80ms 0에 가깝게. 게임 시간·이동은 그대로 | 타이머 |
| 피격 플래시 (`hitReaction.ts`) | 대상 몬스터 머티리얼 emissive를 흰색으로 60ms → 원복. 툰 머티리얼이라 색 조정만으로 충분. **색은 hex로만 지정**(CSS 변수는 three 머티리얼에서 흰색이 됨 — HANDOFF 규칙) | 머티리얼 색 |
| `HitSparks.tsx` + `sparkPool.ts` | 씬에 하나만 있는 `InstancedMesh` 파티클 풀(고정 크기, 링버퍼). 타격 지점에서 방사형으로 튀고 중력·감쇠로 사라짐. 강타는 개수·크기 증가. 라이트 추가 없음 | 드로우콜 1 |
| 데미지 숫자 (`DamageNumbers.tsx` + `damageNumberSpec.ts`) | 플레이어/몬스터 팝업을 공통 컴포넌트로 통합. 일반=흰색, 강타=크고 노란색, 플레이어 피격=빨강. 떠오르며 살짝 튕김. 동시 표시 상한(예: 12개) 초과 시 오래된 것부터 제거 | DOM 상한 |
| 사망 연출 | `kill` 이벤트: 큰 스파크 + 흔들림 + 그 몬스터의 히트스톱. 전역 슬로모션은 모든 `useFrame` delta를 건드려야 해서 위험 대비 이득이 작아 뺐다 | 타이머 |

### 3. 모바일 성능 원칙

- 파티클은 풀 하나로 고정(예: 96개). 새 이벤트가 오면 가장 오래된 슬롯을 재사용 → 할당 없음.
- `pointLight` 추가 금지. 발광은 Bloom(이미 있음)에 맡기고 `toneMapped={false}` 재질로.
- 동시 팝업·이펙트에 상한을 둔다.
- 설정에서 **화면 흔들림 끄기** 제공(멀미 방지). 끄면 `cameraShake` 강도 0. 저장은 `localStorage` 키 `rpg.fx.shake`(`fxSettings.ts`, 실패해도 기본값으로 동작).

### 4. 파일 구성

신규:
- `src/components/game/combatFx.ts` — 버스 + `isHeavyHit` + `diffHits`/`startCombatFxWatcher` + 흔들림 상태(`sampleShake`) + `setHitLeadMs`
- `src/components/game/fxSettings.ts` — 화면 흔들림 설정(zustand, localStorage)
- `src/components/game/CombatFxRoot.tsx` — 워처 시작 + 흔들림 구독
- `src/components/game/hitReaction.ts` — 몬스터 플래시 + 히트스톱(`useHitReaction`)
- `src/components/game/sparkPool.ts` / `HitSparks.tsx` — 파티클 풀과 렌더
- `src/components/game/damageNumberSpec.ts` / `DamageNumbers.tsx` — 숫자 규격(상한 12)과 렌더 (`damageNumbers.ts`는 Windows에서 `DamageNumbers.tsx`와 대소문자 충돌이라 `damageNumberSpec.ts`로 했다)

수정:
- `CharacterMesh.tsx` — `setHitLeadMs` 호출(원거리 지연)
- `PlayerCombatEffects.tsx` — 기존 피격 팝업 제거
- `MonsterMesh.tsx` — `useHitReaction` 연결, 기존 팝업 제거
- `CameraRig.tsx` — 흔들림 오프셋 적용
- `Scene.tsx` — `CombatFxRoot`/`HitSparks`/`DamageNumbers` 마운트
- 설정 UI(SystemMenu) — 흔들림 토글
- `HANDOFF.md` — 전투 연출 규칙 추가

### 5. 오류 처리·테스트

- 연출은 게임플레이를 막지 않는다. 구독자에서 예외가 나도 버스가 삼키고 로그만 남긴다.
- vitest: 버스 발행/구독/해제, `isHeavyHit`, 흔들림 감쇠 계산, 파티클 풀 재사용(초과 시 가장 오래된 슬롯), 팝업 상한, "three 재질에 `var(--` 금지" 기존 가드 유지.
- Playwright로 시각 확인: 평타/스킬/사망/플레이어 피격 스크린샷, 폰 뷰포트에서도 확인.
- 실기기 성능은 배포 후 사용자 확인 필요(자동화로 검증 불가).

### 6. 구현 순서 (계획 단계에서 세분화)

1. 버스 + `isHeavyHit` + 테스트
2. 카메라 흔들림 + 설정 토글
3. 피격 플래시 + 히트스톱
4. HitSparks 풀
5. 데미지 숫자 통합
6. 사망 연출(큰 스파크 + 흔들림 + 히트스톱)
7. HANDOFF 갱신, 시각 확인, 배포
