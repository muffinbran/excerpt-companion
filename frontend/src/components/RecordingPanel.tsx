export default function RecordingPanel() {
  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold mb-6 text-center">Recording</h3>

      {/* Recording Controls */}
      <div className="space-y-4">
        <button className="w-full bg-red-600 hover:bg-red-700 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
          <div className="w-3 h-3 bg-white rounded-full"></div>
          Record
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button className="bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm transition-colors">
            Play Back
          </button>
          <button className="bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm transition-colors">
            Analyze
          </button>
        </div>
      </div>
    </div>
  );
}
