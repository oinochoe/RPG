import { useNavigate } from 'react-router-dom';
import { Modal } from './ui/modal';
import { Button } from './ui/button';
import { useGameSessionStore } from '../stores/gameSessionStore';

/** Shown on the older tab once another tab/device has taken over the account's game session. */
export function SessionReplacedModal() {
  const replaced = useGameSessionStore((s) => s.replaced);
  const navigate = useNavigate();
  return (
    <Modal
      open={replaced}
      dismissible={false}
      title="다른 곳에서 접속했습니다"
      overlayClassName="z-[2147483647]"
      footer={
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            useGameSessionStore.getState().reset();
            navigate('/characters');
          }}
        >
          캐릭터 선택으로
        </Button>
      }
    >
      같은 계정으로 다른 화면에서 게임에 들어와서, 이 화면에서는 더 이상 플레이할 수 없습니다. 진행 상황은 새로 접속한 화면에 이어집니다.
    </Modal>
  );
}
