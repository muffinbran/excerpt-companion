import { useState, useEffect } from "react";

interface Excerpt {
  id: string;
  title: string;
  composer?: string;
}

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
  const [instruments, setInstruments] = useState<string[]>([]);
  const [excerpts, setExcerpts] = useState<Excerpt[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchInstruments();
      fetchExcerpts();
    }
  }, [isOpen]);

  // Clear excerpt selection when instrument changes
  useEffect(() => {
    if (tempExcerpt && tempInstrument) {
      onTempExcerptChange("");
    }
  }, [tempInstrument]);

  const fetchInstruments = async () => {
    try {
      const response = await fetch(
        "http://localhost:8000/excerpts/instruments",
      );
      if (response.ok) {
        const data = await response.json();
        setInstruments(data);
      }
    } catch (error) {
      console.error("Failed to fetch instruments:", error);
    }
  };

  const fetchExcerpts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:8000/excerpts/");
      if (response.ok) {
        const data = await response.json();
        setExcerpts(data);
      }
    } catch (error) {
      console.error("Failed to fetch excerpts:", error);
    } finally {
      setIsLoading(false);
    }
  };

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
              <option value="">Select an instrument...</option>
              {instruments.map((instrument) => (
                <option key={instrument} value={instrument}>
                  {instrument}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Excerpt</label>
            <select
              value={tempExcerpt}
              onChange={(e) => onTempExcerptChange(e.target.value)}
              className={`w-full bg-gray-700 border border-white/20 rounded-lg px-3 py-2 ${
                !tempInstrument ? "opacity-50 cursor-not-allowed" : ""
              }`}
              disabled={isLoading || !tempInstrument}
            >
              <option value="">
                {!tempInstrument
                  ? "Select an instrument first..."
                  : "Select an excerpt..."}
              </option>
              {excerpts.map((excerpt) => (
                <option key={excerpt.id} value={excerpt.title}>
                  {excerpt.title}{" "}
                  {excerpt.composer ? `- ${excerpt.composer}` : ""}
                </option>
              ))}
            </select>
            {isLoading && (
              <p className="text-sm text-gray-400 mt-1">Loading excerpts...</p>
            )}
            {!tempInstrument && (
              <p className="text-sm text-gray-400 mt-1">
                Please select an instrument to view available excerpts.
              </p>
            )}
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
