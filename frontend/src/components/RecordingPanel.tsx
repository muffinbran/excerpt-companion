import { useState, useRef, useEffect } from "react";
import { WebSocketManager } from "../services/WebSocketManager";

interface RecordingPanelProps {
  currentInstrument: string;
  currentExcerpt: string;
}

export default function RecordingPanel({
  currentInstrument,
  currentExcerpt,
}: RecordingPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const managerRef = useRef<WebSocketManager | null>(null);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      managerRef.current?.disconnect();
      managerRef.current = null;
    };
  }, []);

  const startRecording = async () => {
    if (!currentInstrument) {
      // require instrument before recording
      alert("Please select an instrument before recording.");
      return;
    }
    if (!currentExcerpt) {
      alert("Please select an excerpt before recording.");
      return;
    }

    const manager = new WebSocketManager();
    managerRef.current = manager;
    try {
      await manager.connectAndStart(currentExcerpt);
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      managerRef.current = null;
      alert("Could not start recording. See console for details.");
    }
  };

  const stopRecording = () => {
    managerRef.current?.disconnect();
    managerRef.current = null;
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const isDisabled = !currentInstrument || !currentExcerpt;

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold mb-6 text-center">Recording</h3>

      {/* Recording Controls */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={toggleRecording}
          disabled={isDisabled}
          className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
            isDisabled ? "opacity-50 cursor-not-allowed" : ""
          } ${
            isRecording
              ? "bg-transparent text-red-500 hover:bg-red-50"
              : "bg-red-500 hover:bg-red-600 text-white"
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full ${
              isRecording ? "bg-red-500 animate-pulse" : "bg-white"
            }`}
          ></div>
          {isRecording ? "Recording..." : "Record"}
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
