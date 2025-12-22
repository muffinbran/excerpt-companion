import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { NoteAccuracyData } from "../App";

// Constants
const OSMD_CONFIG = {
  autoResize: true,
  backend: "svg" as const,
  drawPartNames: false,
  drawLyrics: false,
  drawSlurs: true,
  coloringEnabled: true, // Enable coloring for note accuracy feedback
  drawTitle: false,
  drawSubtitle: false,
  drawComposer: false,
  drawCredits: true,
  drawMetronomeMarks: false,
  drawCursor: true,
};

const DOM_CLEANUP_DELAY = 50;

interface OSMDScoreProps {
  excerptTitle: string;
  onCursorMove?: (noteIndex: number) => void;
  noteAccuracyMap?: Map<number, NoteAccuracyData>;
}

export interface OSMDScoreHandle {
  startCursor: (tempo: number) => void;
  stopCursor: () => void;
  resetCursor: () => void;
}

const OSMDScore = forwardRef<OSMDScoreHandle, OSMDScoreProps>(
    ({ excerptTitle, onCursorMove, noteAccuracyMap }, ref) => {
      const containerRef = useRef<HTMLDivElement>(null);
      const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
      const abortControllerRef = useRef<AbortController | null>(null);
      const cursorIntervalRef = useRef<number | null>(null);
      const currentNoteIndexRef = useRef<number>(0);
      const [currentNoteIndex, setCurrentNoteIndex] = useState<number>(0);

      // Function to color notes synchronously (extracted for performance)
      const colorNotesUpToIndex = useCallback((upToIndex: number) => {
        if (!osmdRef.current || !containerRef.current) {
          return;
        }

        try {
          const svgElement = containerRef.current.querySelector('svg');
          if (!svgElement) {
            return;
          }

          const staveNotes = svgElement.querySelectorAll('g.vf-stavenote');
          const actualNotes = Array.from(staveNotes).filter(noteGroup => {
            const classes = noteGroup.getAttribute('class') || '';

            // Filter out rests
            if (classes.includes('vf-rest')) {
              return false;
            }
            if (noteGroup.querySelector('.vf-rest, [class*="rest"]') !== null) {
              return false;
            }

            // Filter out grace notes - they are vf-stavenote elements inside vf-modifiers
            const parent = noteGroup.parentElement;
            if (parent && parent.classList.contains('vf-modifiers')) {
              return false;
            }

            return true;
          });

          const shouldReset = !noteAccuracyMap || noteAccuracyMap.size === 0;

          actualNotes.forEach((noteGroup, index) => {
            let color = "#000000";

            if (!shouldReset && index <= upToIndex) {
              const accuracyData = noteAccuracyMap?.get(index);
              if (accuracyData) {
                switch (accuracyData.accuracyLevel) {
                  case 'excellent':
                    color = "#00aa00";
                    break;
                  case 'good':
                    color = "#66cc66";
                    break;
                  case 'fair':
                    color = "#ffcc00";
                    break;
                  case 'poor':
                    color = "#ff6666";
                    break;
                  case 'very_poor':
                    color = "#cc0000";
                    break;
                  case 'unknown':
                    color = "#888888";
                    break;
                }
              }
            }

            const noteId = noteGroup.getAttribute('id') || '';

            // Color note heads
            const noteheads = noteGroup.querySelectorAll('.vf-note .vf-notehead path');
            noteheads.forEach((path) => {
              (path as SVGElement).style.fill = color;
              (path as SVGElement).style.stroke = color;
            });

            // Color internal stems (unbeamed notes)
            const internalStems = noteGroup.querySelectorAll('.vf-note .vf-stem path');
            internalStems.forEach((path) => {
              (path as SVGElement).style.fill = color;
              (path as SVGElement).style.stroke = color;
            });

            // Color external stems (beamed notes)
            if (noteId) {
              const stemId = `${noteId}-stem`;
              const externalStem = svgElement.querySelector(`#${CSS.escape(stemId)}`);
              if (externalStem) {
                const stemPaths = externalStem.querySelectorAll('path');
                stemPaths.forEach((path) => {
                  (path as SVGElement).style.fill = color;
                  (path as SVGElement).style.stroke = color;
                });
              }
            }

            // Color flags
            const flags = noteGroup.querySelectorAll('.vf-flag path');
            flags.forEach((path) => {
              (path as SVGElement).style.fill = color;
              (path as SVGElement).style.stroke = color;
            });

            // Color dots
            const modifiers = noteGroup.querySelectorAll('.vf-modifiers circle');
            modifiers.forEach((circle) => {
              (circle as SVGElement).style.fill = color;
              (circle as SVGElement).style.stroke = color;
            });

            // Color accidentals
            const accidentals = noteGroup.querySelectorAll('.vf-modifiers path');
            accidentals.forEach((path) => {
              (path as SVGElement).style.fill = color;
              (path as SVGElement).style.stroke = color;
            });

            // Color ledger lines
            if (noteId) {
              const ledgersId = `${noteId}ledgers`;
              const ledgers = svgElement.querySelector(`#${CSS.escape(ledgersId)}`);
              if (ledgers) {
                const ledgerPaths = ledgers.querySelectorAll('path');
                ledgerPaths.forEach((path) => {
                  (path as SVGElement).style.fill = color;
                  (path as SVGElement).style.stroke = color;
                });
              }
            }
          });
        } catch (error) {
          console.warn("Error coloring notes:", error);
        }
      }, [noteAccuracyMap]);

      // Expose cursor control methods to parent via ref
      useImperativeHandle(ref, () => ({
        startCursor: (tempo: number) => {
          if (!osmdRef.current?.cursor) {
            console.warn("Cannot start cursor: OSMD not initialized or cursor not available");
            return;
          }

          console.log(`Starting OSMD cursor at ${tempo} BPM...`);

          // Clear any existing interval
          if (cursorIntervalRef.current) {
            clearTimeout(cursorIntervalRef.current);
            cursorIntervalRef.current = null;
          }

          const cursor = osmdRef.current.cursor;
          cursor.reset();
          cursor.show();

          // Reset note index and notify
          currentNoteIndexRef.current = 0;
          setCurrentNoteIndex(0);
          colorNotesUpToIndex(0); // Color immediately for instant feedback
          if (onCursorMove) {
            console.log(`[Cursor] Starting at note 0`);
            onCursorMove(0);
          }

          // Calculate milliseconds per quarter note
          const msPerQuarterNote = 60000 / tempo;

          console.log("Cursor started - showing first note");

          // Function to advance cursor and schedule next advancement
          const advanceCursor = () => {
            if (!osmdRef.current?.cursor) return;

            const cursor = osmdRef.current.cursor;

            // Advance cursor to next note
            cursor.next();

            // Increment note index and notify
            currentNoteIndexRef.current++;
            setCurrentNoteIndex(currentNoteIndexRef.current);
            colorNotesUpToIndex(currentNoteIndexRef.current); // Color immediately for instant feedback
            if (onCursorMove) {
              console.log(`[Cursor] Advanced to note ${currentNoteIndexRef.current}`);
              onCursorMove(currentNoteIndexRef.current);
            }

            // Check if we've reached the end after advancing
            if (!cursor.iterator || cursor.iterator.EndReached) {
              console.log("Cursor reached end of score");
              cursorIntervalRef.current = null;
              return;
            }

            // Now we're at a new position, calculate how long to stay here
            const currentTimestamp = cursor.iterator.currentTimeStamp;
            const currentValue = currentTimestamp.RealValue;

            // We need to peek ahead to see when the NEXT note is
            // Save current state, advance, check next timestamp, then restore
            cursor.next();

            if (cursor.iterator.EndReached) {
              // This is the last note, no next note to advance to
              cursor.previous(); // Go back to the last note
              cursorIntervalRef.current = null;
              return;
            }

            const nextTimestamp = cursor.iterator.currentTimeStamp;
            const nextValue = nextTimestamp.RealValue;

            // Go back to current note
            cursor.previous();

            // Calculate duration of CURRENT note (from current to next)
            const durationInWholeNotes = nextValue - currentValue;
            const durationInQuarterNotes = durationInWholeNotes * 4;
            const durationMs = durationInQuarterNotes * msPerQuarterNote;

            // Schedule next advancement after current note's duration
            if (durationMs > 0) {
              cursorIntervalRef.current = window.setTimeout(advanceCursor, durationMs);
            }
          };

          // Calculate duration of the FIRST note
          const firstTimestamp = cursor.iterator.currentTimeStamp;
          const firstValue = firstTimestamp.RealValue;

          // Peek at the next timestamp
          cursor.next();

          if (!cursor.iterator.EndReached) {
            const secondTimestamp = cursor.iterator.currentTimeStamp;
            const secondValue = secondTimestamp.RealValue;

            // Calculate duration of first note
            const firstDurationInWholeNotes = secondValue - firstValue;
            const firstDurationInQuarterNotes = firstDurationInWholeNotes * 4;
            const firstDurationMs = firstDurationInQuarterNotes * msPerQuarterNote;

            console.log(`First note at ${firstValue.toFixed(3)}, duration ${firstDurationInQuarterNotes.toFixed(3)} quarters (${firstDurationMs.toFixed(1)}ms)`);

            // Reset to show the first note
            cursor.reset();
            cursor.show();

            // Schedule the first advancement after the first note's duration
            cursorIntervalRef.current = window.setTimeout(advanceCursor, firstDurationMs);
          } else {
            console.log("Score has only one note");
            cursor.reset();
            cursor.show();
          }
        },

        stopCursor: () => {
          // Clear the advancement timer
          if (cursorIntervalRef.current) {
            clearTimeout(cursorIntervalRef.current);
            cursorIntervalRef.current = null;
          }

          if (osmdRef.current?.cursor) {
            osmdRef.current.cursor.hide();
            console.log("Cursor stopped and hidden");
          }
        },

        resetCursor: () => {
          // Clear the advancement timer
          if (cursorIntervalRef.current) {
            clearTimeout(cursorIntervalRef.current);
            cursorIntervalRef.current = null;
          }

          if (osmdRef.current?.cursor) {
            osmdRef.current.cursor.reset();
            osmdRef.current.cursor.hide();
            console.log("Cursor reset and hidden");
          }
        },
      }));

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
              console.log("OSMD score loaded", {
                hasCursor: !!osmd.cursor,
              });
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
          // Clear cursor advancement timer
          if (cursorIntervalRef.current) {
            clearTimeout(cursorIntervalRef.current);
            cursorIntervalRef.current = null;
          }

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

      // Effect to color notes based on accuracy data
      // This re-colors when accuracy map changes (e.g., backend sends updates)
      useEffect(() => {
        if (!osmdRef.current) {
          return;
        }

        // Call the synchronous coloring function
        colorNotesUpToIndex(currentNoteIndex);
      }, [noteAccuracyMap, currentNoteIndex, colorNotesUpToIndex]);

      return (
          <div
              ref={containerRef}
              className="w-full h-full overflow-x-auto bg-white rounded-lg"
          />
      );
    });

OSMDScore.displayName = "OSMDScore";

export default OSMDScore;
