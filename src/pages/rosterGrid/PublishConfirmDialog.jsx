// Publish confirmation. Moved out of RosterGridPage as it was.
export default function PublishConfirmDialog({ setShowPublishConfirm, handlePublish }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center scrim px-4" onClick={() => setShowPublishConfirm(false)}>
      <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-base font-bold text-ink">Are you sure you want to publish this roster?</h3>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setShowPublishConfirm(false)} className="btn-secondary text-sm">No</button>
          <button type="button" onClick={handlePublish} className="btn-primary text-sm">Yes</button>
        </div>
      </div>
    </div>
  )
}
