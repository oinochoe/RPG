import { useState, type ReactNode } from 'react';
import { Backpack, Map as MapIcon, Menu, Scroll, Swords, User } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Bar } from '../components/ui/bar';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { GamePanel } from '../components/ui/game-panel';
import { IconButton } from '../components/ui/icon-button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Modal } from '../components/ui/modal';
import { Slot } from '../components/ui/slot';
import { Spinner } from '../components/ui/spinner';
import { TooltipCard } from '../components/ui/tooltip-card';
import { THEME, type Rarity } from '../lib/theme';

// A design-kit page: every shared UI part and its states on one screen, at /dev/ui. It is a lazily
// loaded route with no data behind it — open it on a phone to check touch sizes and colors.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-2xl text-ink">{title}</h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

export function DevUiPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState(1);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 font-display text-4xl text-ink">디자인 킷</h1>
      <p className="mb-8 text-sm text-ink-soft">공용 UI 부품과 상태 모음 (/dev/ui)</p>

      <Section title="색상">
        {Object.entries(THEME.color).map(([name, hex]) => (
          <div key={name} className="w-24 text-center text-xs">
            <div className="h-12 rounded-control border-[3px] border-edge" style={{ background: hex }} />
            <div className="mt-1 font-bold">{name}</div>
            <div className="text-ink-soft">{hex}</div>
          </div>
        ))}
      </Section>

      <Section title="버튼">
        <Button>기본</Button>
        <Button variant="sky">하늘</Button>
        <Button variant="mint">민트</Button>
        <Button variant="ghost">고스트</Button>
        <Button variant="danger">위험</Button>
        <Button disabled>비활성</Button>
        <Button size="sm">작은 버튼</Button>
        <Button size="lg">큰 버튼</Button>
      </Section>

      <Section title="아이콘 버튼">
        <IconButton label="가방"><Backpack className="size-6" /></IconButton>
        <IconButton label="캐릭터" active><User className="size-6" /></IconButton>
        <IconButton label="퀘스트"><Scroll className="size-6" /></IconButton>
        <IconButton label="지도"><MapIcon className="size-6" /></IconButton>
        <IconButton label="메뉴" size="sm"><Menu className="size-5" /></IconButton>
        <IconButton label="공격" disabled><Swords className="size-6" /></IconButton>
      </Section>

      <Section title="상태 바">
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Bar kind="hp" ratio={0.72} label="HP 72 / 100" />
          <Bar kind="mp" ratio={0.4} label="MP 8 / 20" />
          <Bar kind="xp" ratio={0.15} label="EXP 15%" />
          <Bar ratio={1} color="var(--color-danger)" label="보스 체력" height={22} />
          <Bar kind="hp" ratio={0} label="0" />
        </div>
      </Section>

      <Section title="아이템 슬롯">
        {([1, 2, 3, 4, 5] as Rarity[]).map((r) => (
          <Slot key={r} rarity={r} selected={selected === r} onClick={() => setSelected(r)} aria-label={`희귀도 ${r}`}>
            <span className="text-2xl">⚔️</span>
          </Slot>
        ))}
        <Slot rarity={2} quantity={12}><span className="text-2xl">🧪</span></Slot>
        <Slot rarity={4} enchant={5} equipped><span className="text-2xl">🛡️</span></Slot>
        <Slot disabled onClick={() => {}}><span className="text-2xl">📜</span></Slot>
        <Slot />
      </Section>

      <Section title="배지">
        <Badge>기본</Badge>
        <Badge tone="sky">Lv.5</Badge>
        <Badge tone="mint">완료</Badge>
        <Badge tone="gold">NEW</Badge>
        <Badge tone="danger">위험</Badge>
      </Section>

      <Section title="툴팁 카드">
        <TooltipCard title="강철 검" rarity={3}>
          <div>공격력 +7</div>
          <div>요구 레벨 5</div>
        </TooltipCard>
        <TooltipCard title="체력 물약">
          <div>HP를 50 회복합니다.</div>
        </TooltipCard>
      </Section>

      <Section title="입력과 카드">
        <Card className="max-w-xs p-5">
          <Label htmlFor="dev-input">이메일</Label>
          <Input id="dev-input" placeholder="you@example.com" />
          <div className="mt-4 flex items-center gap-3">
            <Spinner size={28} />
            <span className="text-sm text-ink-soft">불러오는 중...</span>
          </div>
        </Card>
      </Section>

      <Section title="창과 대화상자">
        <Button variant="sky" onClick={() => setPanelOpen((v) => !v)}>창 열기/닫기</Button>
        <Button variant="mint" onClick={() => setModalOpen(true)}>대화상자 열기</Button>
      </Section>

      {panelOpen && (
        <GamePanel
          title="가방"
          icon={<Backpack className="size-5" />}
          onClose={() => setPanelOpen(false)}
          frameStyle={{ right: 16, top: 16, width: 300 }}
        >
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Slot key={i} rarity={(i % 5 + 1) as Rarity} quantity={i + 1}>
                <span className="text-xl">🎒</span>
              </Slot>
            ))}
          </div>
        </GamePanel>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="게임 방법"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>건너뛰기</Button>
            <Button onClick={() => setModalOpen(false)}>다음</Button>
          </>
        }
      >
        <p className="text-base leading-relaxed">이동은 조이스틱으로, 공격은 몬스터를 눌러서 합니다.</p>
      </Modal>
    </div>
  );
}
