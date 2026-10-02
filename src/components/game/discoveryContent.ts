import type { DiscoveryDef } from './discoveries';

// The discoveries themselves — plain data. discoveries.ts re-exports this as DISCOVERIES (this file imports only
// its types, so there is no cycle). Every `reward` here is a display copy: the amounts that are really paid live in
// supabase/functions/api/discoveries.ts's DISCOVERY_REWARDS, and discoveryContent.test.ts keeps the two equal.
//
// Rules the content test enforces: anything with `requires` is hidden (a map marker would spoil it); a reward's
// client level requirement equals the server's minLevel; item rewards are item-only; triggers have radius 4..8;
// positions are standable, reachable, and clear of NPCs, dungeon mouths, the river and each other.
//
// The lines are a first draft (tone: deadpan, a little self-aware) — expect them to be rewritten.

export const DISCOVERY_CONTENT: DiscoveryDef[] = [
  // ── 마을 근처 ────────────────────────────────────────────────────────────────
  {
    id: 'sulky-rock',
    kind: 'inspect',
    name: '삐진 바위',
    position: [-19, 12], // 새벽여울 동남쪽 끝
    radius: 2.5,
    prop: 'rock',
    where: '새벽여울 마을 끝자락, 마지막 집 너머 바위 곁.',
    lines: ['삐진 바위다.', '…돌이 삐질 수 있나? 아무튼 삐졌다.', '말을 걸면 더 삐질 것 같아 그냥 두기로 했다.'],
    afterLines: ['아직도 삐져 있다. 뒤끝이 바위만큼 단단하다.'],
  },
  {
    id: 'honest-signpost',
    kind: 'inspect',
    name: '정직한 표지판',
    position: [-13, -113], // 황금이삭 서북쪽 끝
    radius: 2.5,
    prop: 'signpost',
    where: '황금이삭 마을 변두리, 집들이 끝나는 자리.',
    lines: [
      "표지판: '이 앞, 아무것도 없음.'",
      '가 보니 정말 아무것도 없다.',
      '이렇게까지 정직한 표지판은 처음이라 괜히 감동받았다.',
    ],
  },
  {
    id: 'fence-stash',
    kind: 'inspect',
    name: '울타리 밑 비상금',
    position: [-44, 122], // 북녘등불 북서쪽 끝
    radius: 2.5,
    prop: 'none',
    hidden: true,
    hint: '노인이 울타리 쪽을 자꾸 흘끔거린다. 이유는 모른다.',
    where: '북녘등불 마을 끝자락의 울타리 밑.',
    lines: [
      '울타리 밑 흙이 수상하게 볼록하다.',
      "파 보니 동전 주머니가 나왔다. '비상금. 집사람한테는 비밀. —노인'",
      '비밀은 지켜 드리기로 했다. 돈은 못 지켜 드렸지만.',
    ],
    afterLines: ['흙을 다시 덮어 두었다. 범행 현장은 깔끔하게.'],
    reward: { gold: 30, xp: 10 },
  },

  // ── 강·다리 주변 ─────────────────────────────────────────────────────────────
  {
    id: 'no-swimming-sign',
    kind: 'inspect',
    name: '수영 금지 표지판',
    position: [66, 10], // 다리 서쪽 강둑
    radius: 2.5,
    prop: 'signpost',
    where: '강의 풀밭 쪽 강둑, 다리에서 조금 떨어진 곳.',
    lines: [
      "'수영 금지. 이 강은 보기보다 단단합니다.'",
      '실제로 강에 들어가려 하면 무언가에 턱 막힌다.',
      '혹시 물이 아니라 물 그림을 그려 놓은 벽이 아닐까. …더 생각하지 않기로 했다.',
    ],
  },
  {
    id: 'bridge-toll',
    kind: 'trigger',
    name: '다리 밑의 목소리',
    position: [104, -8], // 다리 동쪽, 사막 초입
    radius: 5,
    prop: 'none',
    hidden: true,
    hint: '다리를 건넌 뒤에도 뒤통수가 계속 간지럽다.',
    where: '다리를 건너 사막으로 들어서자마자.',
    lines: [
      "다리 밑에서 누군가 외친다. '통행료!'",
      '돌아보니 아무도 없다. 다리 밑이 너무 좁아서 트롤이 못 들어간 모양이다.',
      '통행료는 다음에 내기로 했다. 아마 영원히 다음에.',
    ],
  },

  // ── 사막 ─────────────────────────────────────────────────────────────────────
  {
    id: 'cracked-jar',
    kind: 'inspect',
    name: '금 간 항아리',
    position: [150, 70],
    radius: 2.5,
    prop: 'none',
    hidden: true,
    requires: [{ type: 'level', min: 5 }],
    hint: '사막에서는 반쯤 묻힌 물건부터 의심하는 게 예의다.',
    where: '다리를 건너 사막 한가운데쯤, 모래가 두꺼운 자리.',
    lines: [
      '모래 속에 금 간 항아리가 반쯤 묻혀 있다.',
      "안에는 물약 두 병과 쪽지. '목마를 때 마시시오. 단, 물은 아님.'",
      '물약으로 목을 축이는 건 좀 이상하지만, 일단 받아 두자.',
    ],
    reward: { itemTemplateId: 7, itemName: '체력 물약', itemQty: 2 },
  },
  {
    id: 'mirage-oasis',
    kind: 'inspect',
    name: '오아시스(?)',
    position: [175, -120],
    radius: 2.5,
    prop: 'sparkle',
    where: '사막을 한참 가로질러, 구울 평원과의 경계가 보일 즈음.',
    lines: ['저 앞에 오아시스가 보인다!', "가까이 가 보니 누가 모래 위에 '오아시스'라고 써 놓았다.", '글씨는 꽤 잘 썼다. 그래서 더 화가 난다.'],
  },
  {
    id: 'lost-camel-sign',
    kind: 'inspect',
    name: '낙타를 찾습니다',
    position: [125, -40],
    radius: 2.5,
    prop: 'signpost',
    where: '다리를 건너 사막으로 조금 들어간 모래밭.',
    lines: [
      "'낙타를 찾습니다. 특징: 등에 혹이 있음.'",
      '…이 사막의 모든 낙타가 해당된다.',
      '그런데 이 세계에서 낙타를 본 적이 있던가? 한 마리도 없다. 주인도 그걸 알고 붙인 것 같다.',
    ],
  },

  // ── 요정의 숲 ────────────────────────────────────────────────────────────────
  {
    id: 'fairy-tip-jar',
    kind: 'inspect',
    name: '요정 팁 통',
    position: [-70, 265],
    radius: 2.5,
    prop: 'mushrooms',
    hidden: true,
    requires: [{ type: 'level', min: 8 }],
    hint: '버섯이 있는 곳엔 요정이 있고, 요정이 있으면 영수증도 있다.',
    where: '요정의 숲 안쪽, 동굴 입구에서도 은둔자에게서도 한참 떨어진 버섯 군락.',
    lines: [
      "버섯 사이에 작은 병이 놓여 있다. '요정 팁 통'",
      "'반짝임 연출 1회 = 마나 물약 1병. 셀프 서비스.'",
      '반짝임을 본 기억은 없지만, 셀프라니까 셀프로 가져간다.',
    ],
    afterLines: ["병에 쪽지가 새로 붙었다. '팁은 넣는 거지 빼는 게 아님.'"],
    reward: { itemTemplateId: 12, itemName: '마나 물약', itemQty: 3 },
  },
  {
    id: 'shy-mushrooms',
    kind: 'inspect',
    name: '수군거리는 버섯들',
    position: [40, 250],
    radius: 2.5,
    prop: 'mushrooms',
    where: '요정의 숲, 동굴 입구 가까이.',
    lines: [
      '버섯들이 뭔가 수군거린다.',
      '가까이 가자 일제히 입을 다문다. 버섯에 입이 있었나?',
      '원래 그냥 버섯이었던 척하는 연기가 꽤 수준급이다.',
    ],
  },
  {
    id: 'retired-fairy',
    kind: 'npc',
    name: '은퇴한 요정',
    position: [160, 285],
    radius: 3,
    prop: 'none',
    npcKind: 'elder',
    hidden: true,
    requires: [{ type: 'level', min: 10 }],
    hint: '숲 구석에 혼자 사는 분이 있다는 소문이다. 출처는 버섯.',
    where: '요정의 숲 맨 구석, 구울 평원과 맞닿기 조금 전.',
    lines: [
      "'날개? 반납했어. 날개 대여 계약이 끝났거든.'",
      "'요즘 요정은 다 계약직이야. 반짝이는 가루도 자비로 사.'",
      "'그래도 퇴직금으로 이 숲 한 귀퉁이는 받았지. 버섯 셋이 세입자야.'",
    ],
  },

  // ── 오크 마을 ────────────────────────────────────────────────────────────────
  {
    id: 'confiscated-sword',
    kind: 'inspect',
    name: '오크 압수품 상자',
    position: [-90, -275],
    radius: 2.5,
    prop: 'rock',
    hidden: true,
    requires: [{ type: 'level', min: 10 }],
    hint: '오크들은 압수라 부르고, 당한 쪽은 강탈이라 부르는 물건이 있다.',
    where: '오크 마을 한켠, 정찰병에게서 한참 떨어진 바위 틈.',
    lines: [
      "바위 틈에 녹슨 상자가 끼어 있다. '압수품 — 인간 모험가 소지'",
      '안에는 멀쩡한 무기가 한 자루. 쥐는 순간 손에 맞는 모양으로 변한다. 수상한 상자다.',
      '원래 주인에게 돌려주는 거라고 생각하자. 그 주인이 누군지는 모르지만.',
    ],
    reward: {
      itemTemplateId: 9,
      itemByClass: { warrior: 9, mage: 10, archer: 11 },
      itemName: '강철 검',
      itemNameByClass: { warrior: '강철 검', mage: '대현자의 지팡이', archer: '사냥꾼의 장궁' },
      itemQty: 1,
    },
  },
  {
    id: 'orc-etiquette-sign',
    kind: 'inspect',
    name: '오크 마을 방문 예절',
    position: [100, -250],
    radius: 2.5,
    prop: 'signpost',
    where: '오크 소굴 입구로 이어지는 길목.',
    lines: ["'오크 마을 방문 예절 1. 비명은 짧게.'", "'2. 도망칠 때는 우측 통행.'", "'3. 여기까지 읽고 서 있는 당신은 이미 늦었음.'"],
  },
  {
    id: 'suited-orc',
    kind: 'npc',
    name: '양복 입은 오크',
    position: [170, -290],
    radius: 3,
    prop: 'none',
    npcKind: 'townsman',
    hidden: true,
    requires: [{ type: 'level', min: 10 }],
    hint: '출퇴근길 인파에 어깨가 유난히 넓은 사람이 섞여 있다.',
    where: '오크 마을 가장자리, 구울 평원 쪽 끝.',
    lines: [
      "'쉿. 나 오크 맞아. 변장한 거야.'",
      "'오크 마을에서 채식한다고 하면 따돌림당하거든. 그래서 사람인 척 출퇴근해.'",
      "'…근데 사람들은 양복 입은 사람한테 더 무섭게 굴더라.'",
    ],
  },

  // ── 뼈의 들판 ────────────────────────────────────────────────────────────────
  {
    id: 'striking-skeleton',
    kind: 'inspect',
    name: '팻말 든 해골',
    position: [-255, 60],
    radius: 2.5,
    prop: 'signpost',
    where: '무덤지기가 서 있는 곳에서 조금 더 들어간 뼈의 들판.',
    lines: [
      "해골이 팻말을 들고 누워 있다. '오늘부터 무덤 야근 거부'",
      '해골은 이미 몇 년째 이 자세다. 파업이라기보다 낮잠에 가깝다.',
      '요구 사항 칸은 비어 있다. 쓰다가 잠든 모양이다.',
    ],
  },
  {
    id: 'bone-piggybank',
    kind: 'inspect',
    name: '해골 저금통',
    position: [-275, -120],
    radius: 2.5,
    prop: 'none',
    hidden: true,
    requires: [{ type: 'level', min: 13 }],
    hint: '뼈라고 다 같은 뼈는 아니다. 어떤 뼈는 모으는 데 열심이었다.',
    where: '뼈의 들판 깊숙한 곳, 무덤지기에게서 멀찍이 떨어진 자리.',
    lines: [
      '갈비뼈 사이에 동전이 잔뜩 끼어 있다.',
      '생전에 저금을 참 열심히 한 모양이다. 쓰지도 못하고.',
      '교훈을 얻었다. 동전도 얻었다. 둘 중 하나는 오래 간직하겠다.',
    ],
    reward: { gold: 120, xp: 60 },
  },
  {
    id: 'skeleton-audition',
    kind: 'inspect',
    name: '해골 병사 모집 공고',
    position: [-260, 160],
    radius: 2.5,
    prop: 'signpost',
    where: '뼈의 들판 깊숙이, 요정의 숲 쪽으로 치우친 자리.',
    lines: [
      "'해골 병사 상시 모집. 자격: 뼈만 있으면 됨.'",
      "'우대: 덜그럭 소리가 좋은 분, 머리가 잘 안 빠지는 분.'",
      '지원해 볼까 했지만 아직 살이 붙어 있어서 서류에서 떨어질 것 같다.',
    ],
  },

  // ── 구울 평원 (수상한 바위 → 구덩이 → 구덩이 상인으로 이어지는 연쇄) ──────────
  {
    id: 'suspicious-rock',
    kind: 'inspect',
    name: '수상한 바위',
    position: [250, -40],
    radius: 2.5,
    prop: 'rock',
    where: '사막의 방랑자에게서 조금 더 걸어간 구울 평원 초입.',
    lines: [
      '수상한 바위다.',
      '아무리 봐도 평범한 바위인데, 그래서 더 수상하다.',
      '바위 너머 남동쪽 땅이 살짝 꺼져 보인다. 저쪽에 뭔가 있는 것 같은데…',
    ],
    afterLines: ['여전히 평범하다. 아주 수상할 만큼.'],
  },
  {
    id: 'bottomless-pit',
    kind: 'inspect',
    name: '바닥 없는 구덩이',
    position: [258, -56],
    radius: 2.5,
    prop: 'pit',
    hidden: true,
    requires: [{ type: 'seen', id: 'suspicious-rock' }],
    hint: '수상한 걸 오래 쳐다본 사람 눈에만 보이는 곳이 있다.',
    where: '수상한 바위에서 조금 떨어진 곳.',
    lines: ['바닥이 보이지 않는 구덩이다.', '돌을 하나 던져 봤다. …… …… …… "아야!"', '구덩이 안에서 누군가 투덜거리며 올라오는 소리가 난다.'],
    afterLines: ['구덩이 안쪽에 사다리가 생겼다. 누군가 정착할 생각인가 보다.'],
  },
  {
    id: 'pit-merchant',
    kind: 'npc',
    name: '구덩이 상인',
    position: [262, -60],
    radius: 3,
    prop: 'none',
    npcKind: 'merchant',
    hidden: true,
    requires: [{ type: 'seen', id: 'bottomless-pit' }],
    hint: '누군가 돌에 맞고 깬 김에 장사를 시작했다는 풍문이 있다.',
    where: '바닥 없는 구덩이 바로 옆.',
    lines: [
      "'돌 던진 게 당신이오? 덕분에 잠이 깨서 개업했소.'",
      "'구덩이 상회요. 오늘의 상품은… 구덩이. 사실 그것밖에 없소.'",
      "'구경은 공짜요. 다음에 또 돌 던지러 오시오. 그게 우리 가게 초인종이오.'",
    ],
  },
  {
    id: 'ghoul-lost-and-found',
    kind: 'inspect',
    name: '구울 분실물 보관소',
    position: [300, 160],
    radius: 2.5,
    prop: 'none',
    hidden: true,
    requires: [{ type: 'level', min: 14 }],
    hint: '잃어버린 물건은 구울이 먹기 전에 찾아가는 게 좋다.',
    where: '저주받은 묘지 입구에서 꽤 떨어진 구울 평원.',
    lines: [
      "'분실물 보관소. 주인이 사흘 안에 안 찾아가면 먹음.'",
      '보관 기한이 한참 지난 사파이어 두 개가 아직 남아 있다. 보석은 맛이 없었나 보다.',
      '주인 대신 맡아 두기로 했다. 사흘 이상.',
    ],
    reward: { itemTemplateId: 64, itemName: '사파이어', itemQty: 2 },
  },

  // ── 유적 근처 ────────────────────────────────────────────────────────────────
  {
    id: 'ruins-fanfare',
    kind: 'trigger',
    name: '웅장한 분위기',
    position: [270, -228], // 고대 유적 서북쪽 진입로
    radius: 6,
    prop: 'none',
    hidden: true,
    hint: '어딘가에서 배경음악이 나와야 할 것 같은 길이 있다.',
    where: '고대 유적 입구로 이어지는 진입로.',
    lines: [
      '(지금쯤 웅장한 음악이 흘러나와야 할 것 같은 분위기다.)',
      '…음악은 나오지 않는다. 예산 문제인 듯하다.',
      '그래도 분위기를 살려 천천히, 비장하게 걸어 들어가 보자.',
    ],
  },
  {
    id: 'ancient-pension',
    kind: 'inspect',
    name: '고대 모험가 연금 수령처',
    position: [296, -250],
    radius: 2.5,
    prop: 'statue',
    hidden: true,
    requires: [{ type: 'level', min: 18 }],
    hint: '먼 길을 걸어온 사람 몫으로 남겨진 게 있다고들 한다.',
    where: '고대 유적 가까이, 발길이 뜸한 자리.',
    lines: [
      "석판에 새겨져 있다. '고대 모험가 연금 — 여기까지 걸어온 자에게 지급함.'",
      '고대인들도 여기까지 걸어오는 게 얼마나 힘든지는 알았던 모양이다.',
      '연금을 수령했다. 왠지 허리가 조금 덜 아프다.',
    ],
    afterLines: ["석판 아래에 작게 적혀 있다. '1인 1회. 욕심내면 저주받음.'"],
    reward: { gold: 150, xp: 80 },
  },

  // ── 필드 중앙부 ──────────────────────────────────────────────────────────────
  {
    id: 'tutorial-stone',
    kind: 'inspect',
    name: '오래된 안내 비석',
    position: [-90, 40],
    radius: 2.5,
    prop: 'statue',
    where: '새벽여울을 벗어나 한참 걸은 들판, 마을과 마을 사이의 외딴 자리.',
    lines: [
      "비석에 새겨져 있다. '이동하려면 땅을 누르시오.'",
      '여기까지 걸어온 사람에게 해 주기엔 너무 늦은 조언이다.',
      '비석을 세운 사람도 튜토리얼은 건너뛰었을 게 분명하다.',
    ],
  },
  {
    id: 'slime-resume',
    kind: 'inspect',
    name: '슬라임의 이력서',
    position: [40, -45],
    radius: 2.5,
    prop: 'signpost',
    where: '강가 가까운 들판, 다리와 황금이삭 사이쯤.',
    lines: [
      "말뚝에 이력서가 붙어 있다. '이름: 슬라임. 특기: 튀기.'",
      "'장점: 말랑함, 긍정적임. 단점: 맞으면 사라짐.'",
      '연락처 칸이 축축하다. 아직 합격 연락은 없는 모양이다.',
    ],
  },
];
