import { create } from 'zustand';

/** One page of the how-to-play guide. `lines` are [label, how] pairs. */
export interface TutorialPage {
  title: string;
  lines: [string, string][];
}

// Bump when the guide changes enough that returning players should see it again.
const STORAGE_KEY = 'rpg.tutorial.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** True until the player has finished or skipped the guide once (per browser). */
export function shouldAutoShowTutorial(storage: Store | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(STORAGE_KEY) !== '1';
  } catch {
    // Storage blocked (private mode etc.): don't nag on every load.
    return false;
  }
}

export function markTutorialSeen(storage: Store | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, '1');
  } catch {
    // best-effort
  }
}

function safeStorage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The guide, worded for the device: a phone has no keyboard, so the keys would be noise. */
export function tutorialPages(isTouch: boolean): TutorialPage[] {
  if (isTouch) {
    return [
      {
        title: '이동과 전투',
        lines: [
          ['이동', '왼쪽 아래 조이스틱을 밀거나, 땅을 터치'],
          ['공격', '몬스터를 터치 (멀면 다가가서 자동 공격)'],
          ['스킬', "스킬을 단축키에 등록한 뒤, 슬롯을 누르고 몬스터를 터치"],
          ['체력 확인', '왼쪽 위 상태창의 HP/MP/EXP'],
        ],
      },
      {
        title: '대화와 아이템',
        lines: [
          ['NPC와 대화', 'NPC 가까이 가면 오른쪽 "대화" 버튼이 켜짐'],
          ['아이템 줍기', '바닥의 아이템을 터치하거나 "줍기" 버튼'],
          ['장비 착용', '"가방"에서 아이템을 고르고 장착'],
          ['강화', '가방에서 주문서를 고르고 "사용" → 강화할 장비를 터치'],
        ],
      },
      {
        title: '메뉴와 단축키',
        lines: [
          ['패널', '왼쪽 위 버튼: 가방 / 캐릭 / 퀘스트 / 지도 / 메뉴'],
          ['단축키 등록', '가방의 물약이나 캐릭의 스킬에서 번호 버튼을 눌러 등록'],
          ['단축키 해제', '슬롯을 길게 누르기'],
          ['첫 목표', '마을의 촌장에게 말을 걸어 퀘스트를 받아보세요'],
        ],
      },
    ];
  }
  return [
    {
      title: '이동과 전투',
      lines: [
        ['이동', 'WASD / 방향키, 또는 땅을 클릭'],
        ['공격', '몬스터를 클릭 (멀면 다가가서 자동 공격)'],
        ['스킬', 'K로 스킬 창을 열어 단축키에 등록 → 번호 키를 누르고 몬스터를 클릭'],
        ['체력 확인', '화면 아래 HP / MP / EXP 바'],
      ],
    },
    {
      title: '대화와 아이템',
      lines: [
        ['NPC와 대화', 'NPC 가까이에서 Space'],
        ['아이템 줍기', '바닥의 아이템을 클릭하거나 F4'],
        ['장비 착용', 'I로 가방을 열고 아이템을 더블클릭'],
        ['강화', '가방에서 주문서를 더블클릭 → 강화할 장비를 더블클릭'],
      ],
    },
    {
      title: '메뉴와 단축키',
      lines: [
        ['패널', 'I 가방 · C 캐릭터 · Q 퀘스트 · M 지도 · F1 메뉴'],
        ['단축키 슬롯', '1~8번 (아이템/스킬을 끌어다 놓거나 번호 버튼으로 등록)'],
        ['단축키 해제', '슬롯을 우클릭'],
        ['첫 목표', '마을의 촌장에게 말을 걸어 퀘스트를 받아보세요'],
      ],
    },
  ];
}

interface TutorialState {
  isOpen: boolean;
  /** Opens on the first game entry only (no-op if already seen). */
  openIfFirstTime: () => void;
  /** Re-open on demand (the menu's 도움말 button). */
  open: () => void;
  /** Closing by finish OR skip both count as "seen". */
  close: () => void;
}

export const useTutorialStore = create<TutorialState>((set) => ({
  isOpen: false,
  openIfFirstTime: () => {
    if (shouldAutoShowTutorial()) set({ isOpen: true });
  },
  open: () => set({ isOpen: true }),
  close: () => {
    markTutorialSeen();
    set({ isOpen: false });
  },
}));
