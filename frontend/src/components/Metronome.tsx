interface MetronomeProps {
  currentTempo: number;
  isMetronomeRunning: boolean;
  onTempoChange: (tempo: number) => void;
  onTempoDecrement: () => void;
  onTempoIncrement: () => void;
  onToggleMetronome: () => void;
}

export default function Metronome({
  currentTempo,
  isMetronomeRunning,
  onTempoChange,
  onTempoDecrement,
  onTempoIncrement,
  onToggleMetronome,
}: MetronomeProps) {
  return (
    <div className="flex-1 p-6 border-b border-white/20">
      <h3 className="text-lg font-semibold mb-6 text-center">Metronome</h3>

      {/* Tempo Display */}
      <div className="text-center mb-8">
        <div className="text-6xl font-bold text-gray-200 mb-2">
          {currentTempo}
        </div>
        <div className="text-gray-300">BPM</div>
      </div>

      {/* Tempo Controls */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <button
          onClick={onTempoDecrement}
          className="bg-gray-700 hover:bg-gray-600 p-3 rounded-full transition-colors"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 12H4"
            />
          </svg>
        </button>

        <div className="flex-1 mx-4">
          <input
            type="range"
            min="60"
            max="200"
            value={currentTempo}
            onChange={(e) => onTempoChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
        </div>

        <button
          onClick={onTempoIncrement}
          className="bg-gray-700 hover:bg-gray-600 p-3 rounded-full transition-colors"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
        </button>
      </div>

      {/* Play/Stop Button */}
      <div className="text-center">
        <button
          onClick={onToggleMetronome}
          className={`px-8 py-4 rounded-full text-lg font-semibold transition-colors ${
            isMetronomeRunning
              ? "bg-red-600 hover:bg-red-700"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {isMetronomeRunning ? "⏹ Stop" : "▶ Start"}
        </button>
      </div>
    </div>
  );
}
