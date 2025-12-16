import { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

// Constants
const OSMD_CONFIG = {
  autoResize: true,
  backend: "svg" as const,
  drawPartNames: false,
  drawLyrics: false,
  drawSlurs: true,
  coloringEnabled: false,
};

const DOM_CLEANUP_DELAY = 50;

interface OSMDScoreProps {
  excerptTitle: string;
}

export default function OSMDScore({ excerptTitle }: OSMDScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (
      !containerRef.current ||
      !excerptTitle ||
      excerptTitle === "No excerpt selected"
    )
      return;

    // Cancel any ongoing load operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const loadScore = async () => {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Always clear any existing OSMD instance first
        if (osmdRef.current) {
          try {
            osmdRef.current.clear();
          } catch (e) {
            console.warn("Error clearing previous OSMD instance:", e);
          }
          osmdRef.current = null;
        }

        // Clear the container completely
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          // Small delay to ensure DOM is clean before creating new instance
          await new Promise((resolve) =>
            setTimeout(resolve, DOM_CLEANUP_DELAY),
          );
        }

        // Check if operation was aborted
        if (abortController.signal.aborted) {
          return;
        }

        // Create new OSMD instance with clean settings
        const osmd = new OpenSheetMusicDisplay(
          containerRef.current!,
          OSMD_CONFIG,
        );

        // Check if operation was aborted
        if (abortController.signal.aborted) {
          return;
        }

        // Fetch and load the MusicXML
        const response = await fetch(
          `http://localhost:8000/excerpts/${encodeURIComponent(excerptTitle)}/musicxml`,
          {
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch MusicXML: ${response.status}`);
        }

        const musicXML = await response.text();

        // Check again if operation was aborted
        if (abortController.signal.aborted) {
          return;
        }

        // Validate basic MusicXML structure
        if (
          !musicXML.includes("score-partwise") &&
          !musicXML.includes("score-timewise")
        ) {
          throw new Error(
            "Received content is not valid MusicXML (missing score-partwise or score-timewise)",
          );
        }

        // Load and render the score only if not aborted
        if (!abortController.signal.aborted) {
          await osmd.load(musicXML);
          osmd.render();
          osmdRef.current = osmd;
        }
      } catch (error) {
        // Ignore AbortError as it's expected when cancelling
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("Error loading OSMD score:", error);
        if (containerRef.current && !abortController.signal.aborted) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          containerRef.current.innerHTML = `
            <div class="text-red-500 p-4 text-sm">
              <p><strong>Error loading score:</strong> ${errorMessage}</p>
              <p class="text-xs mt-2">Make sure the backend is running and the excerpt exists.</p>
            </div>
          `;
        }
      }
    };

    loadScore();

    // Cleanup
    return () => {
      // Abort any ongoing operations
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      if (osmdRef.current) {
        try {
          osmdRef.current.clear();
        } catch (e) {
          console.warn("Error during OSMD cleanup:", e);
        }
        osmdRef.current = null;
      }

      // Also clear the container content as a backup
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [excerptTitle]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-x-auto bg-white rounded-lg"
    />
  );
}
