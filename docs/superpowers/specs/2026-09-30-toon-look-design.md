# 3D 월드 툰 룩 (밝은 스타일라이즈드)

2026-09-30 · 상태: 1차 구현 완료 (브랜치 `feat/toon-look`)

UI를 밝은 톤으로 바꾼 뒤(`2026-09-29-ui-design-system-design.md`) 3D 월드가 어둡고 탁해서 톤이 어긋났다. 모델은 그대로 두고
**재질, 조명, 지형 색, 외곽선**만 바꿔서 같은 화사한 느낌으로 맞춘다. 게임 로직은 바꾸지 않았다.

## 무엇을 어떻게

| 영역 | 방법 |
|---|---|
| 렌더링 | ACES 톤매핑은 색을 죽이고 눌러서 끄고(`NoToneMapping`), 조명으로 밝기를 잡는다 |
| 조명 | 반구광 `#fff`/`#a8d888` 0.6, 환경광 0.35, 태양 `#fff1d6` 1.5. 던전은 예전처럼 어둡게 |
| 모델 재질 | GLTF를 불러올 때 `MeshStandardMaterial`을 `MeshToonMaterial`(3단 명암, 가장 어두운 단도 55%)로 자동 교체. `toon.ts`, `toonGLTF.ts` |
| 절차적 메시 | 지형·바위·마을 바닥·유적 등 `meshStandardMaterial`을 `meshToonMaterial` + `getToonGradient()`로 |
| 외곽선 | 캐릭터·몬스터·NPC에만. 뒤집은 껍질(inverted hull)을 화면 기준 2px로 부풀려 그림. `outline.tsx` |
| 지형 색 | 풀 `#69bb4a`, 숲 `#4f9a62`, 오크 흙 `#8e6248`, 뼈 들판 `#c2b8a2`, 구울 `#55694f`, 자갈 `#cdbc9d`. 미니맵/월드맵도 같은 값 |
| 후처리 | 비네트를 덜 어둡게 (0.4 → 0.22) |

## 규칙

- **모델은 `./toonGLTF`의 `useGLTF`로 불러온다** (drei의 것을 직접 쓰지 말 것). 캐릭터·몬스터·NPC는 `useGLTF(url, { outline: true })`,
  환경(나무·건물·소품)은 외곽선 없이. 그래야 세계가 한 가지 룩을 공유한다.
- **새 절차적 메시는 `meshToonMaterial` + `gradientMap={getToonGradient()}`.**
- 재질을 `clone()` 해서 색을 곱하는 기존 방식(엘리트 색조 등)은 그대로 동작한다. 외곽선 재질은 클래스라서 복제해도 유지된다.
- 외곽선은 그림자를 만들지 않도록 고정되어 있다(소비 코드가 모든 메시의 `castShadow`를 켜도 무시).
- 외곽선은 메시를 한 벌 더 그리므로 폰 성능이 걱정되면 `addOutlines` 호출을 끄면 된다(`toonGLTF.ts`의 `outline` 옵션).

## 범위 밖 (다음)

- 아이템 아이콘(`itemIcons.tsx`)과 몬스터별 색조, 아이템 드랍 빛 색은 아직 옛 톤이다.
- 지도 그림의 바깥 프레임·일부 구역 덮개는 어둡다.
- 전투 이펙트/타격감은 별도 트랙.
