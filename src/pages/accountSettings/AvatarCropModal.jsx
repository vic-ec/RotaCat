import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'

// ── Avatar crop modal ────────────────────────────────────────
export default function AvatarCropModal({ imageSrc, onCancel, onConfirm, saving }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center scrim-strong p-4">
      <div className="card w-full max-w-sm p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Adjust your photo</h3>
        <div className="relative h-72 w-full overflow-hidden rounded-lg bg-canvas-sunken">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="mt-4">
          <label className="label-text">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(croppedAreaPixels)}
            disabled={saving || !croppedAreaPixels}
            className="btn-primary"
          >
            {saving ? 'Saving…' : 'Save photo'}
          </button>
        </div>
      </div>
    </div>
  )
}
