import { useState, useRef, useEffect, type RefObject } from "react";
import { WebSocketManager } from "../services/WebSocketManager";
import type { OSMDScoreHandle } from "./OSMDScore";
import type { NoteAccuracyData } from "../App";

interface RecordingPanelProps {
  currentInstrument: string;
  currentExcerpt: string;
  currentTempo: number;
  osmdScoreRef: RefObject<OSMDScoreHandle | null>;
  onSetCursorMoveCallback: (callback: ((noteIndex: number) => void) | undefined) => void;
  onNoteAccuracy: (accuracyData: NoteAccuracyData) => void;
  onClearNoteAccuracy: () => void;
}

export default function RecordingPanel({
  currentInstrument,
  currentExcerpt,
  currentTempo,
  osmdScoreRef,
  onSetCursorMoveCallback,
  onNoteAccuracy,
  onClearNoteAccuracy,
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

    // Set up cursor move callback to send note index to backend
    const cursorMoveCallback = (noteIndex: number) => {
      console.log(`[RecordingPanel] Cursor callback triggered for note ${noteIndex}`);
      manager.sendNoteIndex(noteIndex);
    };
    onSetCursorMoveCallback(cursorMoveCallback);

    // Set up onset detection callback to start cursor
    manager.onSoundOnset = () => {
      console.log("%c Sound onset detected! Starting OSMD cursor...", "color: #00ff00; font-weight: bold");
      osmdScoreRef.current?.startCursor(currentTempo);
    };

    // Set up analysis callback to receive all backend data
    manager.onAnalysis = (analysis) => {
      // Forward note accuracy data to parent component
      if (analysis.current_note_index !== undefined && analysis.accuracy_level) {
        const accuracyData: NoteAccuracyData = {
          noteIndex: analysis.current_note_index,
          accuracyLevel: analysis.accuracy_level || 'unknown',
          pitchAccurate: analysis.pitch_accurate || false,
          isRightNote: analysis.is_right_note !== false,
          centsOff: analysis.cents_off,
          detectedNote: analysis.detected_note,
          expectedPitch: analysis.expected_pitch,
        };
        onNoteAccuracy(accuracyData);
      }
    };

    try {
      // Clear previous note accuracy data
      onClearNoteAccuracy();

      // Reset cursor before starting
      osmdScoreRef.current?.resetCursor();

      console.log(`%c Starting recording: ${currentExcerpt}`, "color: #33b5ff; font-weight: bold; font-size: 12px");
      console.log(`%c Tempo: ${currentTempo} BPM`, "color: #33b5ff");

      await manager.connectAndStart(currentExcerpt, currentTempo);
      setIsRecording(true);

      console.log("%c Recording started. Waiting for sound onset...", "color: #00ff00; font-weight: bold");
      console.log("%c Backend analyzing: pitch detection, onset detection, score comparison", "color: #999");
    } catch (err) {
      console.error("Failed to start recording:", err);
      managerRef.current = null;
      alert("Could not start recording. See console for details.");
    }
  };

  const stopRecording = () => {
    console.log("%c Stopping recording...", "color: #ff6b6b; font-weight: bold");

    // Stop the cursor
    osmdScoreRef.current?.stopCursor();

    // Clear cursor callback
    onSetCursorMoveCallback(undefined);

    // Disconnect will automatically request summary from backend
    managerRef.current?.disconnect();
    managerRef.current = null;
    setIsRecording(false);

    console.log("%c Recording stopped. Check above for performance summary.", "color: #ffaa00; font-weight: bold");
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
