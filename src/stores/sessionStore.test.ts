import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/maps', () => ({
  enterMap: vi.fn(),
}));

import * as mapsApi from '../api/maps';
import { useSessionStore } from './sessionStore';
import type { EnterMapResponse } from '../types/api';

const enterMapResponse: EnterMapResponse = {
  map_id: 1,
  map_name: 'Starter Field',
  position_x: 0,
  position_y: 0,
  position_z: 0,
  dungeon_instance_id: null,
  monsters: [
    {
      instance_id: 10,
      monster_template_id: 3,
      name: 'Slime',
      level: 1,
      current_hp: 20,
      max_hp: 20,
      position_x: 5,
      position_y: 0,
      position_z: 3,
    },
  ],
};

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({ currentMap: null });
    vi.clearAllMocks();
  });

  it('enterMap stores the map and monster instances from the response', async () => {
    vi.mocked(mapsApi.enterMap).mockResolvedValue(enterMapResponse);

    await useSessionStore.getState().enterMap(1);

    expect(mapsApi.enterMap).toHaveBeenCalledWith(1);
    expect(useSessionStore.getState().currentMap).toEqual(enterMapResponse);
  });
});
