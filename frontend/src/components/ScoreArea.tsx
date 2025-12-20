import { useState, useEffect, forwardRef } from "react";
import OSMDScore from "./OSMDScore";
import type { OSMDScoreHandle } from "./OSMDScore";

// Type definitions for OSMD-based approach
interface ExcerptMetadata {
  id: string;
  title: string;
  composer?: string;
  key_signature?: string;
  time_signature?: string;
  tempo?: number;
  duration?: number;
}

interface ScoreAreaProps {
  currentExcerpt: string;
  onCursorMove?: (noteIndex: number) => void;
}

const ScoreArea = forwardRef<OSMDScoreHandle, ScoreAreaProps>(
  ({ currentExcerpt, onCursorMove }, ref) => {
  const [excerptMetadata, setExcerptMetadata] =
    useState<ExcerptMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExcerptMetadata = async () => {
      if (!currentExcerpt || currentExcerpt === "No excerpt selected") {
        setExcerptMetadata(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Fetch metadata from the original endpoint
        const response = await fetch(
          `http://localhost:8000/excerpts/${encodeURIComponent(currentExcerpt)}`,
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch excerpt metadata: ${response.status}`,
          );
        }
        const data = await response.json();

        // Extract just the metadata we need for the header
        setExcerptMetadata({
          id: data.id,
          title: data.title,
          composer: data.composer,
          key_signature: data.key_signature,
          time_signature: data.time_signature,
          tempo: data.tempo,
          duration: data.duration,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load excerpt metadata",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchExcerptMetadata();
  }, [currentExcerpt]);

  if (!currentExcerpt || currentExcerpt === "No excerpt selected") {
    return (
      <div className="flex-1 p-8 overflow-auto bg-white/5 max-w-8xl">
        <div className="bg-white/80 rounded-lg h-full min-h-96 flex items-center justify-center text-gray-800">
          <div className="text-center">
            <div className="text-6xl mb-4">🎼</div>
            <h2 className="text-2xl font-bold mb-2">Excerpt Companion</h2>
            <p className="text-gray-600">Select an excerpt to view the score</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-8 overflow-auto bg-white/5 max-w-8xl">
        <div className="bg-white/80 rounded-lg h-full min-h-96 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p className="text-gray-600">Loading score...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-8 overflow-auto bg-white/5 max-w-8xl">
        <div className="bg-white/80 rounded-lg h-full min-h-96 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold mb-2 text-red-600">
              Error Loading Score
            </h2>
            <p className="text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-auto bg-white/5 max-w-8xl">
      <div className="bg-white/90 rounded-lg min-h-fit p-6 flex flex-col">
        {/* Simplified Score Header - only essential info not visible in score */}
        {excerptMetadata && (
          <div className="border-b border-gray-300 pb-3 mb-4 flex-shrink-0">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">
                  {excerptMetadata.title}
                </h1>
                {excerptMetadata.composer && (
                  <p className="text-lg text-gray-600 mt-1">
                    by {excerptMetadata.composer}
                  </p>
                )}
              </div>
              {/* Goal Tempo - from score metadata */}
              {excerptMetadata.tempo && (
                <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
                  <span className="text-sm text-gray-600">Goal:</span>
                  <span className="text-lg font-bold text-gray-800">
                    {excerptMetadata.tempo}
                  </span>
                  <span className="text-sm text-gray-600">BPM</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Score Content using OSMD - takes remaining space */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm flex-1">
          <OSMDScore ref={ref} excerptTitle={currentExcerpt} onCursorMove={onCursorMove} />
        </div>
      </div>
    </div>
  );
});

ScoreArea.displayName = "ScoreArea";

export default ScoreArea;
