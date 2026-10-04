import ConfirmDialog from './ConfirmDialog';

interface UnsavedChangesDialogProps {
  open: boolean;
  /** Stay on the screen and keep editing (the safe outcome — keeps focus). */
  onStay: () => void;
  /** Leave anyway, discarding the edits. */
  onDiscard: () => void;
}

/**
 * §16.1 global chrome — shared *Unsaved changes* state. Composed from
 * ConfirmDialog with the roles flipped: "Keep editing" is the cancel side
 * (focused, escape-hatch) and "Discard changes" is the destructive confirm.
 */
export default function UnsavedChangesDialog({
  open,
  onStay,
  onDiscard,
}: UnsavedChangesDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="You have unsaved changes"
      description="Your edits will be lost if you leave this screen. You can stay and save them first."
      cancelLabel="Keep editing"
      confirmLabel="Discard changes"
      destructive
      onCancel={onStay}
      onConfirm={onDiscard}
    />
  );
}
