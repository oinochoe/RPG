# 드롭률 조정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일반 몬스터의 드롭 확률을 약 65%에서 약 25%로, 엘리트/대장급을 100%에서 약 60%로 낮추고, 마나 물약이 몰린 버섯 지역 표를 다듬는다.

**Architecture:** 서버 `drops.ts`의 `NOTHING_WEIGHT` 상수와 8·9번 표의 마나 물약 가중치만 바꾼다. 표 안의 상대 비율은 유지한다. 규칙 코드·DB 마이그레이션 없음. 엣지 함수만 재배포한다.

**Tech Stack:** TypeScript(Deno 엣지 함수, vitest로 순수 모듈 테스트).

**Spec:** `docs/superpowers/specs/2026-10-01-drop-rate-tuning-design.md`

## 스펙과 달라진 점

- 스펙의 `dropChanceFor` export 대신, **테스트가 `rollDropEntry`를 rng 스윕으로 직접 굴려** 확률을 측정한다(새 export 없이 실제 굴림 경로를 검증).
- 버섯 정령(9)처럼 항목이 3개뿐인 표는 전체 확률이 25%여도 항목당 비중이 커서 마나 물약이 킬당 약 11%가 된다. 스펙의 "약 5~8%"는 "최대 약 12%, 대부분 4~9%"로 정정한다(마나 중심 지역 컨셉 유지).

## Global Constraints

- 보스 5종(이름 키 `BOSS_DROP_TABLE`)은 항상 드롭(100%)을 유지한다. 강화 주문서 확률(`SCROLL_CHANCES_*`)은 수정하지 않는다.
- 가중치의 상대 비율은 바꾸지 않는다(단 8·9번 마나 계열 가중치는 아래 값으로).
- 새 주석은 영어, 커밋 메시지는 한글, 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- 작업은 워크트리에서 하고 `npm ci`한다. 마지막에 `git push origin HEAD:main`.

## Review Focus

- 보스 이름으로 굴리면 어떤 rng 값에서도 `null`이 나오지 않는다. (Task 1)
- 템플릿 ID에 표가 없으면 `null`을 돌려주고 예외가 없다. (기존 동작 유지, Task 1 테스트)
- 강화 주문서 굴림이 표 굴림보다 먼저이고 그대로 동작한다(rng가 낮으면 주문서). (Task 1)
- 15개 템플릿(1~15) 전부 목표 확률 범위 안이다 — 하나라도 빠지면 눈에 띈다. (Task 1)

---

### Task 1: NOTHING_WEIGHT 재계산과 확률 테스트

**Files:**
- Modify: `supabase/functions/api/drops.ts` (`NOTHING_WEIGHT`, 템플릿 8·9 표의 마나 물약 가중치)
- Test: `src/stores/serverEconomy.test.ts` (확률 측정 테스트 추가; 기존 테스트 중 가중치를 가정한 것은 새 값에 맞춤)

**Interfaces:**
- Consumes: `rollDropEntry(monsterTemplateId, monsterName, rng)` (기존).
- Produces: 같은 시그니처, 새 확률.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/serverEconomy.test.ts`의 `rollDropEntry`를 이미 import하는 위치에 아래 `describe`를 추가한다(파일 끝). rng는 "첫 호출(강화 주문서 굴림)은 실패하도록 0.99, 둘째 호출부터는 스윕 값"을 돌려준다.

```ts
describe('drop rates', () => {
  // Measures the real roll path: the scroll roll (first rng call) is forced to miss, then the
  // table roll sweeps the whole [0, 1) range, so the fractions below are exact to the step size.
  const STEPS = 4000;
  function measure(templateId: number, name: string) {
    let drops = 0;
    let mana = 0;
    for (let i = 0; i < STEPS; i++) {
      const r = (i + 0.5) / STEPS;
      let call = 0;
      const entry = rollDropEntry(templateId, name, () => (call++ === 0 ? 0.99 : r));
      if (entry) {
        drops++;
        if (entry.itemTemplateId === 12 || entry.itemTemplateId === 13) mana++;
      }
    }
    return { drop: drops / STEPS, mana: mana / STEPS };
  }

  const REGULAR = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 15];
  const ELITE = [5, 13, 14];

  it.each(REGULAR)('a regular monster (template %i) drops something about 25% of the time', (id) => {
    const { drop } = measure(id, `m${id}`);
    expect(drop).toBeGreaterThan(0.23);
    expect(drop).toBeLessThan(0.27);
  });

  it.each(ELITE)('an elite (template %i) drops something about 60% of the time', (id) => {
    const { drop } = measure(id, `m${id}`);
    expect(drop).toBeGreaterThan(0.57);
    expect(drop).toBeLessThan(0.63);
  });

  it('keeps mana potions from dominating any kill: at most about 12% per kill', () => {
    for (const id of [...REGULAR, ...ELITE]) {
      expect(measure(id, `m${id}`).mana, `template ${id}`).toBeLessThan(0.13);
    }
  });

  it('never returns nothing for a tracked boss', () => {
    for (const boss of ['태고의 거인', '거인 군주', '오크 군주', '구울 군주', '버섯 군주']) {
      for (let i = 0; i < 2000; i++) {
        const r = (i + 0.5) / 2000;
        let call = 0;
        expect(rollDropEntry(5, boss, () => (call++ === 0 ? 0.99 : r)), `${boss} @ ${r}`).not.toBeNull();
      }
    }
  });

  it('still rolls a scroll before the table when the scroll roll hits', () => {
    // rng 0 is below every non-zero scroll chance, so the first scroll in order (weapon) wins for a tier that has one.
    const entry = rollDropEntry(13, 'm13', () => 0);
    expect(entry?.itemType).toBe('scroll');
  });

  it('returns null for a template with no drop table', () => {
    expect(rollDropEntry(9999, 'nobody', () => 0.5)).toBeNull();
  });
});
```

Run: `npx vitest run src/stores/serverEconomy.test.ts`
Expected: FAIL — 일반/엘리트 확률 테스트(현재 약 65%/100%), 마나 12% 테스트가 실패한다. 보스·주문서·표 없음 테스트는 이미 통과한다.

- [ ] **Step 2: 상수 수정**

`supabase/functions/api/drops.ts`:

1. 템플릿 8(버섯왕)의 마나 물약 가중치 `30` → `15`, 상급 마나 물약 `20` → `10`. 템플릿 9(버섯 정령)의 마나 물약 `30` → `12`.
2. `NOTHING_WEIGHT`를 아래로 교체한다(일반 = 항목 가중치 합 × 3 → 25%, 엘리트 = 합 × 2/3 → 60%). 위 가중치 수정 후 합계: 1:82, 2:89, 3:91, 4:76, 5:129, 6:87, 7:108, 8:47, 9:26, 10:88, 11:77, 12:83, 13:96, 14:84, 15:80.

```ts
const NOTHING_WEIGHT: Record<number, number> = {
  1: 246,
  2: 267,
  3: 273,
  4: 228,
  // 거인 군주 species (captain tier outside the tracked boss) and the two field elites: about 60%.
  5: 86,
  6: 261,
  7: 324,
  8: 141,
  9: 78,
  10: 264,
  11: 231,
  12: 249,
  13: 64,
  14: 56,
  15: 240,
};
```

3. 위의 `NOTHING_WEIGHT` 앞 주석(슬라임 40/60 예시와 "boss (5) always drops")을 새 의도로 바꾼다: 일반은 약 25%, 엘리트/대장급(5, 13, 14)은 약 60%, 추적 보스는 `BOSS_DROP_TABLE`(이름 키)로 항상 드롭. 계산식 `round(합 × (1/p − 1))`을 주석에 적는다.

(템플릿 5의 가중치 합 129는 현재 표 기준: 50+30+15+5+20+6+3. 값이 다르면 합을 다시 계산해 `round(합×2/3)`로 맞추고 보고서에 적는다.)

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run src/stores/serverEconomy.test.ts && npx tsc -b`
Expected: PASS. 기존 테스트가 이전 확률/가중치를 가정해 실패하면 **테스트의 가정**을 새 값에 맞춰 고치고 어떤 것을 왜 고쳤는지 보고서에 적는다. 마나 12% 테스트가 특정 템플릿에서 실패하면 그 표의 마나 가중치만 더 낮추고 보고한다.

- [ ] **Step 4: 전체 검증과 커밋**

Run: `npx vitest run`
Expected: 전체 통과.

```bash
git add supabase/functions/api/drops.ts src/stores/serverEconomy.test.ts
git commit -m "fix(drops): 드롭률을 낮춤 — 일반 약 25%, 엘리트 약 60%, 버섯 지역 마나 물약 비중 축소

일반 몬스터가 킬당 약 65%를 드롭하고 마나 물약이 12~45%에 달해 아이템이 너무 흔했다.
리니지는 확률을 공개하지 않아 그 성격(골드가 주수입, 아이템은 드물게)에 맞췄다. 보스·강화 주문서 확률은 그대로.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 스펙 정정, 푸시, 엣지 함수 배포

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-drop-rate-tuning-design.md`

- [ ] **Step 1: 스펙 정정**

"추가로 마나 물약이 몰린 버섯왕·버섯 정령 표…" 문장의 수치(8: 30→18, 상급 20→12, 9: 30→18)와 "목표 결과"를 이 계획의 값(8: 30→15, 상급 20→10, 9: 30→12; 킬당 마나 물약 최대 약 12%, 대부분 4~9%)으로 고치고, `dropChanceFor` 대신 rng 스윕 테스트를 쓴다고 적는다.

- [ ] **Step 2: 푸시와 배포**

```bash
git add docs/superpowers/specs/2026-10-01-drop-rate-tuning-design.md
git commit -m "docs: 드롭률 스펙을 구현에 맞게 정정

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin HEAD:main
```

엣지 함수는 CLI로 배포한다(프로젝트 ref `rfdxirssgsktnjgslocu`, `--no-verify-jwt`, 이 프로젝트의 HANDOFF "배포 방법" 절차 그대로). 배포 후 `https://www.roleplaying.kr/api/health`가 200인지 확인하고, 사용자에게 몇 마리 잡아 드롭이 줄었는지 확인을 요청한다. 워크트리를 정리한다.
