import { Button, Modal } from './kit';

/** Pregunta antes de cerrar la sesión, para que un toque por error no saque a nadie del sistema. */
export function ConfirmLogout({ detail, onConfirm, onCancel }: { detail?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      title="¿Cerrar sesión?"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} autoFocus>
            Cancelar
          </Button>
          <Button variant="primary" icon="logout" onClick={onConfirm}>
            Sí, cerrar sesión
          </Button>
        </>
      }
    >
      <div className="small">{detail ?? 'Para volver a entrar necesitarás tu usuario y contraseña.'}</div>
    </Modal>
  );
}
