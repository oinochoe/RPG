# UI 디자인 시스템 (밝은 스타일라이즈드 판타지)

2026-09-29 · 상태: 구현 완료 (브랜치 `feat/ui-design-system`)

## 목표

기존 UI는 어두운 양피지 + 금색 톤이었고, 화면마다 인라인 스타일과 하드코딩 색(색 리터럴 408번, 서로 다른 색 137가지)이
흩어져 있었다. 서풍의 광시곡/템페스트처럼 밝고 화사한 판타지 느낌으로 바꾸면서, 색과 형태의 기준을 한 곳(토큰)에 모으고
화면들이 공용 부품을 쓰게 한다. **게임 로직은 바꾸지 않는다** — 스타일과 구조만 바꿨다.

정해진 것: 방향은 밝은 스타일라이즈드(크림/하늘/민트 + 금색 포인트), 토큰과 공용 부품 8개를 먼저 만들고 화면별로 점진 이관,
`/dev/ui` 디자인 킷 페이지 포함.

## 토큰

`src/index.css`의 `@theme`이 원본이고 Tailwind 유틸(`bg-cream`, `text-ink`, `border-edge`, `shadow-chunk`, `rounded-panel`,
`font-display`…)이 된다. 같은 값이 `src/lib/theme.ts`에도 있어 three.js/인라인 스타일에서 쓴다.
`src/lib/theme.test.ts`가 (1) 두 곳이 어긋나지 않는지, (2) 화면에서 실제로 쓰는 글자/배경 조합이 WCAG AA(4.5:1)인지 검사한다.

| 역할 | 토큰 |
|---|---|
| 면 | `cream` `cream-deep` |
| 포인트(장식·배경용) | `sky` `sky-deep` `mint` `mint-deep` `gold` `gold-deep` |
| 밝은 하이라이트(그라데이션 윗변) | `gold-light` `sky-light` `mint-light` `danger-light` |
| 글자 | `ink` `ink-soft` 와, 포인트색의 어두운 짝: `gold-ink` `sky-ink` `mint-ink` `violet-ink` `danger-ink` |
| 외곽선·상태·경고 | `edge` `hp` `mp` `xp` `danger` `night` |
| 아이템 희귀도 | `THEME.rarity[0..4]` |

**핵심 규칙:** 밝은 포인트색(`gold` 등)은 크림 위에서 글자로 쓰면 안 읽힌다(대비 2~4:1). 글자는 반드시 `ink`, `ink-soft`, 또는
`*-ink`를 쓴다. 글꼴은 제목/숫자 `Jua`, 본문 `Noto Sans KR`(Google Fonts). 형태는 3px 따뜻한 갈색 외곽선, 둥근 모서리(12~18px),
아래로 떨어지는 단단한 그림자(`shadow-chunk`)와 눌리는 버튼(`active:translate-y`).

## 공용 부품 (`src/components/ui/`)

| 부품 | 역할 |
|---|---|
| `GamePanel` | 창 프레임: 하늘색 제목줄(드래그 손잡이), 닫기, 크림 본문. `useDraggablePanel`의 `frameStyle`/`onHeaderPointerDown`을 그대로 받는다 |
| `Button` | primary(금) / sky / mint / ghost / danger, 크기 sm/default/lg. 터치에서는 최소 44px. `type`은 강제하지 않는다(폼 제출 유지) |
| `IconButton` | 아이콘 하나짜리 정사각 버튼. 접근성 이름(`label`) 필수, md=44px |
| `Bar` | HP/MP/EXP 바(`kind`) 또는 임의 색. 비율은 0..1로 자르고 NaN은 0으로 |
| `Slot` | 아이템 칸: 희귀도 테두리, 수량/강화/착용 배지, 선택·비활성. 클릭 핸들러가 있으면 키보드로도 동작 |
| `Badge` `Modal` `TooltipCard` | 작은 라벨 / 대화상자(Escape·배경 클릭으로 닫힘, `dismissible`, `overlayClassName`) / 정보 카드 |
| `Card` `Input` `Label` `Spinner` | 인증 화면용, 새 토큰으로 재스타일 |

`/dev/ui`에서 모든 부품과 상태를 한 화면에 볼 수 있다(지연 로딩이라 게임 번들에 영향 없음, 폰으로 열어 터치 크기 확인).

## 이관 결과

| 단계 | 대상 |
|---|---|
| 0 토대 | 토큰, 글꼴, 부품 8개, `/dev/ui`, 테마 테스트 |
| 1 첫인상 | 로그인, 가입, 비밀번호 찾기/재설정, 이메일 인증, 캐릭터 선택 |
| 2 HUD | 상태 카드/바, 핫바, 상호작용 안내, 폰 HUD(44px 버튼·조이스틱·행동 버튼), 미니맵 프레임, 버프/독/둔화(공용 `StatusEffectIcon`), 툴팁, 토스트, 튜토리얼 |
| 3 패널 | 인벤토리, 캐릭터, 상점, 퀘스트, 퀘스트 로그, 메뉴, 지도 |
| 4 월드 위 UI | 이름표, 체력바, 데미지 숫자(굵은 외곽선) |
| 5 마무리 | 반복되던 밝은 색을 토큰으로 승격, 옛 색 정리 |

폰 HUD가 커져서(버튼 36→44px) 패널이 HUD를 가리지 않게 하는 상수를 `hudLayout.ts`로 모았다
(`TOUCH_TOP_INSET`, `TOUCH_LEFT_COLUMN`, `TOUCH_STATUS_WIDTH`). HUD 크기를 바꾸면 여기만 고친다.

## 범위 밖 (다음 작업)

- **월드 아트의 색:** 지형/조명/안개, 몬스터·캐릭터 재질, 아이템 아이콘 SVG, 지도 그림, 이펙트 색은 아직 옛 톤이다. 밝은 UI와
  3D 화면의 톤을 맞추는 작업(툰 셰이딩·외곽선·색감 보정)이 별도 트랙이다.
- 폰에서 보이는 월드 범위(카메라 줌)는 이번 작업과 무관하다.
