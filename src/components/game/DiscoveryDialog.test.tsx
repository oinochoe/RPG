import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '../../types/api';
import type { DiscoveryDef } from './discoveries';

const defs: Record<string, DiscoveryDef> = {
  plain: { id: 'plain', kind: 'inspect', name: '바위', position: [0, 0], radius: 2, prop: 'rock', lines: ['하나', '둘'], afterLines: ['또 왔네'] },
  paying: {
    id: 'paying', kind: 'inspect', name: '보물', position: [0, 0], radius: 2, prop: 'sparkle', lines: ['반짝', '찾았다'],
    reward: { gold: 30, xp: 5, itemTemplateId: 7, itemName: '낡은 열쇠', itemQty: 2 },
  },
};
vi.mock('./discoveries', () => ({ getDiscovery: (id: string) => defs[id], DISCOVERIES: [] }));
const claimDiscovery = vi.fn();
vi.mock('../../api/characters', () => ({ claimDiscovery: (id: string) => claimDiscovery(id), listClaimedDiscoveries: vi.fn() }));

import { DiscoveryDialog } from './DiscoveryDialog';
import { useUIStore } from '../../stores/uiStore';
import { useDiscoveryStore } from '../../stores/discoveryStore';
import { useCharacterStore } from '../../stores/characterStore';
import { talkToNearby } from './interactions';

const okResult = {
  progress: { level: 1, experience: 5, gold: 30 } as never,
  inventory: [],
  reward: { gold: 30, xp: 5, item_template_id: 7, item_qty: 2 },
};

beforeEach(() => {
  claimDiscovery.mockReset();
  useUIStore.setState({ discoveryDialogId: null, nearDiscoveryId: null });
  useDiscoveryStore.getState().reset();
  useCharacterStore.setState({ activeCharacter: { id: 9 } as never });
});

const open = (id: string) => act(() => useUIStore.getState().openDiscovery(id));

describe('DiscoveryDialog', () => {
  it('renders nothing when no discovery is open', () => {
    const { container } = render(<DiscoveryDialog />);
    expect(container).toBeEmptyDOMElement();
  });

  it('walks the lines, then claims once and shows what was obtained', async () => {
    claimDiscovery.mockResolvedValue(okResult);
    render(<DiscoveryDialog />);
    open('paying');
    expect(screen.getByText('보물')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('찾았다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: /다음/ }));
    expect(await screen.findByText('획득: 골드 30 · 경험치 5 · 낡은 열쇠 x2')).toBeInTheDocument();
    expect(claimDiscovery).toHaveBeenCalledTimes(1);
    expect(useDiscoveryStore.getState().claimed.has('paying')).toBe(true);
  });

  it('says the reward was already taken on a 409', async () => {
    claimDiscovery.mockRejectedValue(new ApiError(409, { error: 'conflict', reason: 'discovery_already_claimed' }));
    render(<DiscoveryDialog />);
    open('paying');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByText(/이미 받은/)).toBeInTheDocument();
    expect(useDiscoveryStore.getState().claimed.has('paying')).toBe(true);
  });

  it('offers a retry after any other failure', async () => {
    claimDiscovery.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(okResult);
    render(<DiscoveryDialog />);
    open('paying');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText(/획득:/)).toBeInTheDocument();
    expect(claimDiscovery).toHaveBeenCalledTimes(2);
  });

  it('an already-seen discovery shows only afterLines and never claims', () => {
    useDiscoveryStore.setState({ seen: new Set(['paying', 'plain']) });
    render(<DiscoveryDialog />);
    open('plain');
    expect(screen.getByText('또 왔네')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(useUIStore.getState().discoveryDialogId).toBeNull();
    open('paying');
    expect(screen.getByText('찾았다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(claimDiscovery).not.toHaveBeenCalled();
    expect(useUIStore.getState().discoveryDialogId).toBeNull();
  });

  it('a reward-less discovery is marked seen when finished, then closes', () => {
    render(<DiscoveryDialog />);
    open('plain');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(useDiscoveryStore.getState().seen.has('plain')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(useDiscoveryStore.getState().seen.has('plain')).toBe(true);
    expect(useUIStore.getState().discoveryDialogId).toBeNull();
  });

  it('Space advances without re-triggering talkToNearby; Escape closes', async () => {
    render(<DiscoveryDialog />);
    open('plain');
    act(() => useUIStore.getState().setNearDiscoveryId('plain'));
    const space = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
    act(() => { window.dispatchEvent(space); });
    expect(screen.getByText('둘')).toBeInTheDocument();
    expect(talkToNearby()).toBe(true); // swallowed while open: does not restart the dialog
    expect(screen.getByText('둘')).toBeInTheDocument();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', cancelable: true })); });
    await waitFor(() => expect(useUIStore.getState().discoveryDialogId).toBeNull());
    expect(screen.queryByText('바위')).toBeNull();
  });
});
