import { useState } from "react";
import Toolbar from "./components/Toolbar";
import ScoreArea from "./components/ScoreArea";
import Metronome from "./components/Metronome";
import RecordingPanel from "./components/RecordingPanel";
import InstrumentDialog from "./components/InstrumentDialog";

function App() {
  const [isInstrumentDialogOpen, setIsInstrumentDialogOpen] = useState(false);
  const [currentInstrument, setCurrentInstrument] = useState("");
  const [currentExcerpt, setCurrentExcerpt] = useState("");
  const [currentTempo, setCurrentTempo] = useState(120);
  const [isMetronomeRunning, setIsMetronomeRunning] = useState(false);
  const [tempInstrument, setTempInstrument] = useState("");
  const [tempExcerpt, setTempExcerpt] = useState("");

  const handleTempoChange = (value: number) => {
    setCurrentTempo(value);
  };

  const handleTempoDecrement = () => {
    setCurrentTempo(Math.max(60, currentTempo - 5));
  };

  const handleTempoIncrement = () => {
    setCurrentTempo(Math.min(200, currentTempo + 5));
  };

  const toggleMetronome = () => {
    setIsMetronomeRunning(!isMetronomeRunning);
  };

  const handleApplySelection = () => {
    setCurrentInstrument(tempInstrument);
    setCurrentExcerpt(tempExcerpt);
    setIsInstrumentDialogOpen(false);
  };

  const handleDialogOpen = () => {
    setTempInstrument(currentInstrument);
    setTempExcerpt(currentExcerpt);
    setIsInstrumentDialogOpen(true);
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] w-full text-gray-100 flex">
      {/* Left Panel - Score and Toolbar */}
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar
          currentInstrument={currentInstrument}
          currentExcerpt={currentExcerpt}
          onOpenDialog={handleDialogOpen}
        />

        <ScoreArea currentExcerpt={currentExcerpt} />
      </div>

      {/* Right Panel - Controls */}
      <div className="max-w-md border-l border-white/20 flex flex-col">
        {/* Top spacer to align with main content */}
        <div className="h-4"></div>

        <Metronome
          currentTempo={currentTempo}
          isMetronomeRunning={isMetronomeRunning}
          onTempoChange={handleTempoChange}
          onTempoDecrement={handleTempoDecrement}
          onTempoIncrement={handleTempoIncrement}
          onToggleMetronome={toggleMetronome}
        />

        <RecordingPanel
          currentInstrument={currentInstrument}
          currentExcerpt={currentExcerpt}
        />
      </div>

      <InstrumentDialog
        isOpen={isInstrumentDialogOpen}
        tempInstrument={tempInstrument}
        tempExcerpt={tempExcerpt}
        onTempInstrumentChange={setTempInstrument}
        onTempExcerptChange={setTempExcerpt}
        onCancel={() => setIsInstrumentDialogOpen(false)}
        onApply={handleApplySelection}
      />
    </div>
  );
}

export default App;
