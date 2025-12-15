interface InstrumentDialogProps {
  isOpen: boolean;
  tempInstrument: string;
  tempExcerpt: string;
  onTempInstrumentChange: (instrument: string) => void;
  onTempExcerptChange: (excerpt: string) => void;
  onCancel: () => void;
  onApply: () => void;
}

export default function InstrumentDialog({
  isOpen,
  tempInstrument,
  tempExcerpt,
  onTempInstrumentChange,
  onTempExcerptChange,
  onCancel,
  onApply,
}: InstrumentDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-transparent backdrop-blur flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-96 max-w-[90vw]">
        <h2 className="text-xl font-bold mb-6">Select Instrument & Excerpt</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Instrument</label>
            <select
              value={tempInstrument}
              onChange={(e) => onTempInstrumentChange(e.target.value)}
              className="w-full bg-gray-700 border border-white/20 rounded-lg px-3 py-2"
            >
              <option>Clarinet</option>
              <option>Flute</option>
              <option>Oboe</option>
              <option>Bassoon</option>
              <option>Horn</option>
              <option>Trumpet</option>
              <option>Violin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Excerpt</label>
            <select
              value={tempExcerpt}
              onChange={(e) => onTempExcerptChange(e.target.value)}
              className="w-full bg-gray-700 border border-white/20 rounded-lg px-3 py-2"
            >
              <option>Mozart Exposition</option>
              <option>Brahms Symphony No. 1</option>
              <option>Beethoven Symphony No. 5</option>
              <option>Tchaikovsky Symphony No. 4</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="flex-1 bg-gray-600 hover:bg-blue-700 py-2 rounded-lg transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
