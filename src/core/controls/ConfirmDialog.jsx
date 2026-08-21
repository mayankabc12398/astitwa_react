import { Button } from './Button.jsx'
import { Modal } from './Modal.jsx'

export function ConfirmDialog({
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onResolve,
}) {
  return (
    <Modal
      narrow
      title={title}
      labelledBy="confirm-title"
      onClose={() => onResolve(false)}
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={() => onResolve(false)}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => onResolve(true)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  )
}
