const API_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";
const SAMPLE_RATE = 44100;


// Generate a unique session ID for this user session
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

const WORKLET_CODE = `
  // Helper function must be defined inside the string
  function floatTo16BitPCM(input) {
      const buffer = new ArrayBuffer(input.length * 2);
      const output = new DataView(buffer);
      let offset = 0;
      for (let i = 0; i < input.length; i++, offset += 2) {
          const s = Math.max(-1, Math.min(1, input[i]));
          output.setInt16(offset, s * 0x7FFF, true);
      }
      return buffer;
  }

  class AudioProcessor extends AudioWorkletProcessor {
      constructor() {
          super();
          this.port.onmessage = (event) => {
              // Handle any future config messages here
          };
      }

      process(inputs, outputs, parameters) {
          const inputChannelData = inputs[0][0];

          if (inputChannelData && inputChannelData.length > 0) {
              const buffer = floatTo16BitPCM(inputChannelData);
              
              // Post audio buffer (backend handles analysis)
              this.port.postMessage({
                  audioBuffer: buffer
              }, [buffer]);
          }

          return true;
      }
  }

  registerProcessor('audio-processor', AudioProcessor);
`;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sessionId: string;
  private hasDetectedOnset: boolean = false;
  public onFeedback: (data: any) => void = () => {};
  public onSoundOnset: () => void = () => {};
  public onAnalysis: (analysis: any) => void = () => {}; // Callback for analysis data

  constructor() {
    this.sessionId = generateSessionId();
  }

  public async connectAndStart(excerptId: string, tempo: number = 120) {
    if (this.ws) {
      this.ws.close();
    }

    // Reset onset detection for new session
    this.hasDetectedOnset = false;

    this.ws = new WebSocket(
      `${API_URL}/ws/audio/${excerptId}/${this.sessionId}`,
    );
    this.ws.binaryType = "arraybuffer";
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

    const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    await this.audioContext.audioWorklet.addModule(blobUrl);
    URL.revokeObjectURL(blobUrl);

    // Wire lifecycle handlers
    this.ws.onopen = () => {
      // Send tempo configuration to backend
      if (this.ws?.readyState === WebSocket.OPEN) {
        console.log(`[WebSocket] Sending tempo: ${tempo} BPM`);
        this.ws.send(JSON.stringify({ command: "set_tempo", tempo: tempo }));
      }
      this.startMicrophoneStream();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onFeedback(data);

        // Handle analysis data from backend
        if (data.status === "analyzed" && data.analysis) {
          const analysis = data.analysis;

          // Handle onset detection from backend
          if (analysis.onset_detected && !this.hasDetectedOnset) {
            this.hasDetectedOnset = true;
            this.onSoundOnset();
          }

          // Log rests separately (no onset detection required for rests)
          if (analysis.is_rest) {
            console.log(
              `%c🎵 Note ${analysis.current_note_index}: REST`,
              `color: #999999; font-weight: bold`
            );
          }

          // Log pitch detection with score comparison (only after first onset detected)
          // if (analysis.pitch_hz && analysis.expected_pitch && this.hasDetectedOnset) {
          //   const centsStr = analysis.cents_off
          //     ? (analysis.cents_off > 0 ? `+${analysis.cents_off.toFixed(1)}` : analysis.cents_off.toFixed(1))
          //     : "?";
          //
          //   // Categorize accuracy based on cents deviation (frontend decision)
          //   const absCents = Math.abs(analysis.cents_off || 0);
          //   const isCorrect = absCents <= 50; // 50 cents threshold for correct
          //   const accuracyIcon = isCorrect ? "✓" : "✗";
          //   const color = isCorrect ? "#00ff00" : "#ff0000";
          //   const accuracyText = isCorrect ? "Correct" : "Incorrect";
          //
          //   const detectedNote = analysis.detected_note || "?";
          //
          //   console.log(
          //     `%c${accuracyIcon} Note ${analysis.current_note_index}: Expected ${analysis.expected_pitch} | ` +
          //     `Detected ${detectedNote} (${analysis.pitch_hz.toFixed(1)} Hz) | ` +
          //     `Cents off: ${centsStr} | ${accuracyText}`,
          //     `color: ${color}; font-weight: bold`
          //   );
          // }

          // Call analysis callback for custom handling
          this.onAnalysis(analysis);
        }

        // Handle summary/report data
        if (data.status === "summary") {
          // console.log("%c📋 PERFORMANCE SUMMARY", "color: #ffaa00; font-weight: bold; font-size: 14px");
          // console.table(data.data);

          // Also log as structured object for inspection
          console.log("Raw summary data:", data.data);
        }
      } catch (e) {
        console.warn("Failed to parse WebSocket message:", e);
      }
    };

    this.ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    this.ws.onclose = (event) => {
      if (!event.wasClean) {
        console.warn("WebSocket closed unexpectedly:", event.reason || "Unknown reason");
      }
    };

    return new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanupListeners();
        resolve();
      };
      const onError = (err: Event) => {
        console.error("WebSocket connection error:", err);
        cleanupListeners();
        reject(err);
      };
      const onCloseBeforeOpen = () => {
        console.warn("WebSocket closed before connection established");
        cleanupListeners();
        reject(new Error("WebSocket closed before open"));
      };

      const cleanupListeners = () => {
        if (!this.ws) return;
        this.ws.removeEventListener("open", onOpen);
        this.ws.removeEventListener("error", onError as any);
        this.ws.removeEventListener("close", onCloseBeforeOpen as any);
      };

      if (!this.ws) {
        reject(new Error("WebSocket not created"));
        return;
      }
      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onError as any);
      this.ws.addEventListener("close", onCloseBeforeOpen as any);
    });
  }

  private async startMicrophoneStream() {
    if (!this.audioContext || !this.ws) {
      console.warn("Cannot start microphone: missing context or connection");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: SAMPLE_RATE },
      });
      const source = this.audioContext.createMediaStreamSource(stream);
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "audio-processor",
      );
      this.workletNode.port.onmessage = (event) => {
        const data = event.data;

        // Send audio buffer to WebSocket
        if (
          this.ws?.readyState === WebSocket.OPEN &&
          data.audioBuffer instanceof ArrayBuffer
        ) {
          this.ws.send(data.audioBuffer);
        }
      };
      this.workletNode.port.postMessage({
        type: "sampleRate",
        rate: SAMPLE_RATE,
      });
      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      this.disconnect();
    }
  }

  public requestSummary() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ command: "get_summary" }));
    }
  }

  public sendNoteIndex(noteIndex: number) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`[WebSocket] Sending note index: ${noteIndex}`);
      this.ws.send(JSON.stringify({ command: "set_note_index", note_index: noteIndex }));
    } else {
      console.warn(`[WebSocket] Cannot send note index ${noteIndex} - connection not open`);
    }
  }

  public disconnect() {
    this.hasDetectedOnset = false;
    this.requestSummary();

    if (this.ws) {
      try {
        setTimeout(() => {
          if (this.ws) {
            this.ws.close();
          }
        }, 100);
      } catch (e) {
        console.error("Error closing WebSocket:", e);
      }
      this.ws = null;
    }
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: "disconnect" });
      } catch {
        // ignore
      }
      try {
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }
    if (this.audioContext) {
      this.audioContext
        .close()
        .catch((e) => console.error("Error closing audio context:", e));
      this.audioContext = null;
    }
  }
}
