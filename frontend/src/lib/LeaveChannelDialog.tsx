'use client';

import { useEffect, useMemo, useState } from 'react';
import { chatsAPI } from '../services/api';
import ConfirmDialog from '../app/components/ConfirmDialog';

export type TransferCandidate = {
  userId: string;
  displayName: string;
  role: string;
};

type LeaveChannelDialogProps = {
  open: boolean;
  conversationId: string;
  channelName: string;
  isOwner?: boolean;
  transferCandidates?: TransferCandidate[];
  onClose: () => void;
  onSuccess: () => void;
};

export default function LeaveChannelDialog({
  open,
  conversationId,
  channelName,
  isOwner: isOwnerProp,
  transferCandidates: transferCandidatesProp,
  onClose,
  onSuccess,
}: LeaveChannelDialogProps) {
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const [isOwner, setIsOwner] = useState(!!isOwnerProp);
  const [transferCandidates, setTransferCandidates] = useState<TransferCandidate[]>(
    transferCandidatesProp || [],
  );
  const [transferOwnerTo, setTransferOwnerTo] = useState('');

  useEffect(() => {
    if (!open) {
      setError('');
      setTransferOwnerTo('');
      return;
    }

    if (isOwnerProp !== undefined && transferCandidatesProp) {
      setIsOwner(isOwnerProp);
      setTransferCandidates(transferCandidatesProp);
      const admins = transferCandidatesProp.filter((c) => c.role === 'ADMIN');
      const preferred = admins.length > 0 ? admins : transferCandidatesProp;
      setTransferOwnerTo(preferred[0]?.userId || '');
      return;
    }

    setLoadingDetails(true);
    setError('');
    chatsAPI
      .getDetails(conversationId)
      .then((data: {
        isOwner?: boolean;
        transferCandidates?: TransferCandidate[];
      }) => {
        const candidates = data.transferCandidates || [];
        setIsOwner(!!data.isOwner);
        setTransferCandidates(candidates);
        const admins = candidates.filter((c) => c.role === 'ADMIN');
        const preferred = admins.length > 0 ? admins : candidates;
        setTransferOwnerTo(preferred[0]?.userId || '');
      })
      .catch(() => setError('Could not load channel details.'))
      .finally(() => setLoadingDetails(false));
  }, [open, conversationId, isOwnerProp, transferCandidatesProp]);

  const adminCandidates = useMemo(
    () => transferCandidates.filter((c) => c.role === 'ADMIN'),
    [transferCandidates],
  );

  const mustPickAdmin = adminCandidates.length > 0;
  const pickerOptions = mustPickAdmin ? adminCandidates : transferCandidates;

  const soleMember = isOwner && transferCandidates.length === 0;

  async function handleConfirmLeave() {
    setLeaving(true);
    setError('');
    try {
      await chatsAPI.leave(
        conversationId,
        isOwner ? transferOwnerTo : undefined,
      );
      onSuccess();
      onClose();
    } catch {
      setError('Could not leave the channel.');
    } finally {
      setLeaving(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title={isOwner ? 'Transfer ownership and leave?' : 'Leave channel?'}
      description={
        isOwner
          ? `Choose who will own #${channelName} before you leave.`
          : `You will no longer receive messages from #${channelName}.`
      }
      confirmLabel={isOwner ? 'Transfer and leave' : 'Leave channel'}
      cancelLabel="Cancel"
      variant="danger"
      loading={leaving || loadingDetails}
      confirmDisabled={
        loadingDetails ||
        soleMember ||
        (isOwner && !transferOwnerTo)
      }
      onConfirm={() => void handleConfirmLeave()}
      onCancel={onClose}
    >
      {loadingDetails ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : soleMember ? (
        <p className="text-sm text-red-600">
          You are the only member. Add someone else before leaving.
        </p>
      ) : isOwner ? (
        <label className="block text-sm font-medium text-slate-700">
          New owner
          <select
            value={transferOwnerTo}
            onChange={(e) => setTransferOwnerTo(e.target.value)}
            className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
          >
            {pickerOptions.map((candidate) => (
              <option key={candidate.userId} value={candidate.userId}>
                {candidate.displayName}
                {candidate.role === 'ADMIN' ? ' (Admin)' : ''}
              </option>
            ))}
          </select>
          {!mustPickAdmin && (
            <span className="mt-1 block text-xs text-slate-500">
              No channel admins — select any member to become owner.
            </span>
          )}
        </label>
      ) : null}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </ConfirmDialog>
  );
}
