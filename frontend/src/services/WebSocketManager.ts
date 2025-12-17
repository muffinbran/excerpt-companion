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
              // Post the converted buffer back to the main thread
              this.port.postMessage(buffer, [buffer]);
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
  public onFeedback: (data: any) => void = () => {};

  constructor() {
    this.sessionId = generateSessionId();
    console.log(
      `WebSocketManager: initialized with session ID: ${this.sessionId}`,
    );
  }

  public async connectAndStart(excerptId: string) {
    if (this.ws) {
      console.log(
        "WebSocketManager: closing existing websocket before creating a new one.",
      );
      this.ws.close();
    }

    console.log(
      `WebSocketManager: creating websocket to ${API_URL}/ws/audio/${excerptId}/${this.sessionId}`,
    );
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
      console.log("WebSocketManager: websocket open");
      this.startMicrophoneStream();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onFeedback(data);
      } catch (e) {}
    };

    this.ws.onerror = (err) => {
      console.error("WebSocketManager: websocket error:", err);
    };

    this.ws.onclose = (event) => {
      console.log("WebSocketManager: websocket closed", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    };

    return new Promise<void>((resolve, reject) => {
      // Resolve once opened, or reject on error/close before open
      const onOpen = () => {
        console.log("WebSocketManager: connected.");
        cleanupListeners();
        resolve();
      };
      const onError = (err: Event) => {
        console.error("WebSocketManager: error while connecting:", err);
        cleanupListeners();
        reject(err);
      };
      const onCloseBeforeOpen = (ev: CloseEvent) => {
        console.warn(
          "WebSocketManager: closed before connection was established:",
          ev,
        );
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
      console.warn(
        "WebSocketManager: cannot start microphone stream, missing audioContext or websocket.",
      );
      return;
    }
    try {
      console.log("WebSocketManager: starting microphone stream");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: SAMPLE_RATE },
      });
      const source = this.audioContext.createMediaStreamSource(stream);
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "audio-processor",
      );
      this.workletNode.port.onmessage = (event) => {
        if (
          this.ws?.readyState === WebSocket.OPEN &&
          event.data instanceof ArrayBuffer
        ) {
          this.ws.send(event.data);
        }
      };
      this.workletNode.port.postMessage({
        type: "sampleRate",
        rate: SAMPLE_RATE,
      });
      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
      console.log(
        "WebSocketManager: microphone stream and worklet node started",
      );
    } catch (error) {
      console.error(
        "WebSocketManager: Error accessing microphone or setting up AudioWorklet:",
        error,
      );
      this.disconnect();
    }
  }

  public disconnect() {
    console.log("WebSocketManager: disconnect called");
    if (this.ws) {
      console.log("WebSocketManager: closing websocket");
      try {
        this.ws.close();
      } catch (e) {
        console.error("WebSocketManager: error closing websocket", e);
      }
      this.ws = null;
    }
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: "disconnect" });
      } catch (e) {
        // ignore
      }
      try {
        this.workletNode.disconnect();
      } catch (e) {
        // ignore
      }
      this.workletNode = null;
      console.log("WebSocketManager: worklet node stopped");
    }
    if (this.audioContext) {
      this.audioContext
        .close()
        .then(() => console.log("WebSocketManager: audio context closed"))
        .catch((e) =>
          console.error("WebSocketManager: error closing audioContext", e),
        );
      this.audioContext = null;
    }
  }
}
