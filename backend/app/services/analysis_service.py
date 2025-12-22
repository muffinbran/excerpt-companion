"""
Real-time audio analysis service for musical performance evaluation.

This service processes audio chunks from WebSocket streams and provides:
- Pitch detection and accuracy measurement
- Rhythm/timing analysis
- Volume/dynamics tracking
- Note onset detection
"""

import numpy as np
from typing import Optional, Dict, Any, List

from app.schemas.excerpt_model import ExcerptModel
from app.services.excerpt_service import parse_excerpt, get_excerpts_dir, find_excerpt_by_title


def note_to_frequency(note_name: str) -> Optional[float]:
    """
    Convert a note name (e.g., 'A4', 'C#5') to its frequency in Hz.

    Args:
        note_name: Note name with octave (e.g., 'A4', 'C#5', 'Bb3')

    Returns:
        Frequency in Hz, or None if invalid note name
    """
    if note_name == "rest" or not note_name:
        return None

    # Note to semitone mapping (C0 = 0)
    note_map = {
        'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
        'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    }

    try:
        # Parse note name (e.g., "C4", "F#5", "Bb3")
        # Handle both sharp (#) and flat (b) notation
        if len(note_name) >= 2:
            if note_name[1] in ['#', 'b']:
                note = note_name[:2]
                octave = int(note_name[2:])
            else:
                note = note_name[0]
                octave = int(note_name[1:])

            if note not in note_map:
                return None

            # Calculate MIDI note number
            midi_note = (octave + 1) * 12 + note_map[note]

            # Convert MIDI note to frequency (A4 = 440 Hz is MIDI note 69)
            frequency = 440.0 * (2.0 ** ((midi_note - 69) / 12.0))

            return frequency
    except (ValueError, IndexError):
        return None

    return None


class AudioAnalyzer:
    """
    Analyzes audio data in real-time to provide performance feedback.

    Designed to work with streaming audio chunks from WebSocket connections.
    """

    def __init__(self, sample_rate: int = 44100, chunk_size: int = 4096):
        """
        Initialize the audio analyzer.

        Args:
            sample_rate: Audio sample rate in Hz (default: 44100)
            chunk_size: Size of audio chunks to process
        """
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.total_bytes = 0

        # Pitch detection buffer (accumulate multiple chunks)
        self.pitch_detection_buffer: np.ndarray = np.array([], dtype=np.float32)
        self.min_samples_for_pitch = 2048  # Need at least this many samples for reliable pitch detection

        # Analysis state - adaptive RMS + slope onset detection
        self.onset_detected = False  # Track if we've detected the main onset
        self.onset_time: Optional[float] = None  # Time of the main onset

        # Adaptive onset detection parameters - slightly less strict but still robust
        self.rms_history: List[float] = []  # Rolling window of RMS values
        self.rms_window_size = 50  # Number of RMS values to keep for slope calculation (much longer)
        self.noise_floor = 0.001  # Running estimate of background noise level
        self.noise_floor_alpha = 0.002  # Smoothing factor for noise floor update (very slow adaptation)
        self.adaptive_threshold_factor = 7.0  # Multiplier above noise floor (reduced from 10.0)
        self.min_slope_threshold = 0.015  # Minimum RMS slope required (reduced from 0.02)
        self.min_sustained_samples = 5  # Require sustained energy increase over multiple samples

        # Loudness persistence tracking - slightly more permissive
        self.loudness_threshold_factor = 4.0  # Signal must be at least 4x noise floor
        self.min_loud_frames = 6  # Must be loud for at least 6 consecutive frames (reduced from 8)
        self.consecutive_loud_frames = 0  # Counter for consecutive frames above loudness threshold

        # Performance metrics
        self.detected_pitches: List[float] = []

    def add_audio_chunk(self, chunk: bytes) -> Dict[str, Any]:
        """
        Add an audio chunk and perform analysis.

        Args:
            chunk: Raw audio bytes (PCM format expected)

        Returns:
            Dictionary containing analysis results
        """
        self.total_bytes += len(chunk)

        # Perform basic analysis on the chunk
        analysis = self._analyze_chunk(chunk)

        return analysis

    def _analyze_chunk(self, chunk: bytes) -> Dict[str, Any]:
        """
        Analyze a single audio chunk.

        Args:
            chunk: Raw audio bytes

        Returns:
            Analysis results including RMS, onset detection, etc.
        """
        try:
            # Convert bytes to numpy array (assuming 16-bit PCM, mono)
            audio_data = np.frombuffer(chunk, dtype=np.int16)

            if len(audio_data) == 0:
                return {"status": "empty"}

            # Normalize to [-1, 1]
            audio_float = audio_data.astype(np.float32) / 32768.0

            # Calculate RMS (Root Mean Square) - represents volume/energy
            rms = np.sqrt(np.mean(audio_float ** 2))

            # Adaptive RMS + slope onset detection - very strict criteria with loudness persistence
            current_onset = False
            current_time_seconds = float(self.total_bytes) / float(self.sample_rate * 2)

            if not self.onset_detected:
                # Add current RMS to history
                self.rms_history.append(rms)

                # Keep only recent history for slope calculation
                if len(self.rms_history) > self.rms_window_size:
                    self.rms_history.pop(0)

                # Update noise floor estimate very conservatively (only for very quiet signals)
                if rms < self.noise_floor * 1.5:  # Only update if RMS is very close to current floor
                    self.noise_floor = (1 - self.noise_floor_alpha) * self.noise_floor + self.noise_floor_alpha * rms

                # Track loudness persistence - signal must stay above loudness threshold
                loudness_threshold = self.noise_floor * self.loudness_threshold_factor
                if rms > loudness_threshold:
                    self.consecutive_loud_frames += 1
                else:
                    self.consecutive_loud_frames = 0  # Reset if signal drops below threshold

                # Only proceed with onset detection if we have sustained loudness
                if self.consecutive_loud_frames >= self.min_loud_frames:
                    # Calculate adaptive threshold - much higher than loudness threshold
                    adaptive_threshold = self.noise_floor * self.adaptive_threshold_factor

                    # Calculate RMS slope if we have enough history
                    rms_slope = 0.0
                    sustained_increase = False

                    if len(self.rms_history) >= 8:  # Require more history for stability
                        # Use more samples for slope calculation for stability
                        recent_samples = 8
                        recent_rms = self.rms_history[-recent_samples:]
                        # Linear regression slope approximation: (y2 - y1) / (x2 - x1)
                        rms_slope = (recent_rms[-1] - recent_rms[0]) / (recent_samples - 1)

                        # Check for sustained increase - require multiple consecutive increases
                        if len(recent_rms) >= self.min_sustained_samples:
                            increases = 0
                            for i in range(1, self.min_sustained_samples):
                                if recent_rms[-i] > recent_rms[-(i+1)]:
                                    increases += 1
                            sustained_increase = increases >= (self.min_sustained_samples - 2)  # Allow 1 decrease

                    # Slightly less strict onset criteria: ALL must be satisfied + loudness persistence
                    if (rms > adaptive_threshold and           # High amplitude threshold
                        rms_slope > self.min_slope_threshold and  # Strong positive slope
                        sustained_increase and                # Sustained energy increase
                        len(self.rms_history) >= 20 and     # Need substantial history
                        rms > self.noise_floor * 6.0):      # Reduced secondary amplitude check (from 8.0)

                        self.onset_detected = True
                        self.onset_time = current_time_seconds
                        current_onset = True
                        print(f"[AudioAnalyzer] Onset detected at {current_time_seconds:.2f}s")
                        print(f"  RMS: {rms:.4f}, Threshold: {adaptive_threshold:.4f}, Noise floor: {self.noise_floor:.4f}")
                        print(f"  RMS slope: {rms_slope:.6f}, Min slope: {self.min_slope_threshold:.6f}")
                        print(f"  Sustained increase: {sustained_increase}, History length: {len(self.rms_history)}")
                        print(f"  Consecutive loud frames: {self.consecutive_loud_frames}/{self.min_loud_frames}")
                else:
                    # Not loud enough for long enough - don't even consider onset
                    pass

            # Accumulate samples for pitch detection
            self.pitch_detection_buffer = np.concatenate([self.pitch_detection_buffer, audio_float])

            # Only attempt pitch detection when we have enough samples
            pitch = None
            if len(self.pitch_detection_buffer) >= self.min_samples_for_pitch:
                pitch = self._detect_pitch(self.pitch_detection_buffer)

                if pitch is not None and pitch > 0:
                    # store as Python float to avoid numpy types when serializing
                    self.detected_pitches.append(float(pitch))

                # Keep only the most recent samples in the buffer (sliding window)
                # Keep 50% overlap for better continuity
                keep_samples = self.min_samples_for_pitch // 2
                self.pitch_detection_buffer = self.pitch_detection_buffer[-keep_samples:]

            # Prepare analysis results
            result = {
                "status": "analyzed",
                "rms": float(rms),
                "onset_detected": bool(current_onset),
                "pitch_hz": float(pitch) if pitch else None,
                "timestamp_seconds": current_time_seconds,
            }

            return result

        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _detect_pitch(self, audio_data: np.ndarray) -> Optional[float]:
        """
        Detect the fundamental frequency (pitch) using autocorrelation.

        Args:
            audio_data: Normalized audio samples [-1, 1]

        Returns:
            Detected pitch in Hz, or None if not detected
        """
        # Check signal strength
        max_amplitude = np.max(np.abs(audio_data))
        rms = np.sqrt(np.mean(audio_data ** 2))

        # Skip if signal is too quiet (very low threshold)
        if max_amplitude < 0.002:  # Even lower threshold
            return None

        # Autocorrelation
        correlation = np.correlate(audio_data, audio_data, mode='full')
        correlation = correlation[len(correlation) // 2:]

        # Normalize correlation
        correlation = correlation / correlation[0] if correlation[0] > 0 else correlation

        # Define search range for musical pitches (roughly 50 Hz to 2000 Hz)
        min_period = int(self.sample_rate / 2000)  # Max frequency
        max_period = int(self.sample_rate / 50)     # Min frequency

        if max_period >= len(correlation):
            return None

        # Find peak in valid range
        search_range = correlation[min_period:max_period]
        if len(search_range) == 0:
            return None

        # Find the first significant peak (not just the maximum)
        # Look for peaks above a threshold
        peak_threshold = 0.3  # Correlation must be at least 30% of max
        peak_index = None

        for i in range(1, len(search_range) - 1):
            # Check if this is a local maximum above threshold
            if (search_range[i] > search_range[i-1] and
                search_range[i] > search_range[i+1] and
                search_range[i] > peak_threshold):
                peak_index = i + min_period
                break

        # If no significant peak found, use the global maximum
        if peak_index is None:
            peak_index = np.argmax(search_range) + min_period

        # Convert period to frequency
        if peak_index > 0:
            frequency = self.sample_rate / peak_index

            # Validate frequency is in reasonable musical range
            if 50 <= frequency <= 2000:
                return frequency

        return None

    def get_summary(self) -> Dict[str, Any]:
        """
        Get a summary of the analyzed performance.

        Returns:
            Dictionary with performance statistics
        """
        avg_pitch = None
        if self.detected_pitches:
            avg_pitch = np.mean(self.detected_pitches)

        return {
            "total_duration_seconds": float(self.total_bytes) / float(self.sample_rate * 2),
            "total_bytes_received": int(self.total_bytes),
            "onset_detected": self.onset_detected,
            "onset_time": float(self.onset_time) if self.onset_time else None,
            "detected_pitches": list(self.detected_pitches)[:10],  # First 10 for brevity
            "average_pitch_hz": float(avg_pitch) if avg_pitch else None,
            "num_pitch_detections": int(len(self.detected_pitches)),
        }

    def reset(self):
        """Reset the analyzer state."""
        self.total_bytes = 0
        self.pitch_detection_buffer = np.array([], dtype=np.float32)
        self.onset_detected = False
        self.onset_time = None
        self.detected_pitches.clear()

        # Reset adaptive onset detection state
        self.rms_history.clear()
        self.noise_floor = 0.001
        self.consecutive_loud_frames = 0


class PerformanceAnalyzer:
    """
    Higher-level analyzer that compares performance against a reference score.

    Loads the MusicXML score and compares detected pitches and timing
    against the expected notes from the score.
    """

    def __init__(self, excerpt_id: str):
        """
        Initialize performance analyzer for a specific excerpt.

        Args:
            excerpt_id: ID of the musical excerpt being performed
        """
        self.excerpt_id = excerpt_id
        self.audio_analyzer = AudioAnalyzer()

        # Load the excerpt score
        self.excerpt: Optional[ExcerptModel] = None
        self.expected_notes: List[Dict[str, Any]] = []
        self.current_note_index = 0
        self.tempo = 120  # Default tempo, will be set from frontend

        try:
            self._load_excerpt(excerpt_id)
        except Exception as e:
            print(f"Warning: Could not load excerpt {excerpt_id}: {e}")

    def _load_excerpt(self, excerpt_id: str):
        """
        Load the MusicXML excerpt and extract expected notes.

        Args:
            excerpt_id: Either a title (e.g., 'Clarinet Concerto in A major, Mvt. 1')
                       or a path-like ID (e.g., 'clarinet/Mozart Exposition')
        """
        excerpts_dir = get_excerpts_dir()

        # First, try to find by title (most common case from frontend)
        self.excerpt = find_excerpt_by_title(excerpt_id)

        if not self.excerpt:
            # Fall back to path-based lookup
            # Convert excerpt_id to file path
            # Handle both .mxl and .musicxml extensions
            file_path = excerpts_dir / f"{excerpt_id}.mxl"
            if not file_path.exists():
                file_path = excerpts_dir / f"{excerpt_id}.musicxml"

            if file_path.exists():
                # Parse the excerpt
                self.excerpt = parse_excerpt(file_path)

        if self.excerpt:
            # Extract notes (skip rests for now)
            for item in self.excerpt.notes_and_rests:
                # Check if it's a note (has pitch attribute) and not a rest
                if hasattr(item, 'pitch'):
                    pitch = item.pitch
                    if pitch and pitch != "rest":
                        freq = note_to_frequency(pitch)
                        if freq:
                            self.expected_notes.append({
                                "pitch": pitch,
                                "frequency": freq,
                                "duration_quarter": item.duration_quarter,
                                "offset": item.offset,
                            })

    def _frequency_to_note(self, frequency: float) -> str:
        """
        Convert frequency to nearest note name.

        Args:
            frequency: Frequency in Hz

        Returns:
            Note name (e.g., 'A4', 'C#5')
        """
        if frequency <= 0:
            return "Unknown"

        # Convert frequency to MIDI note number
        midi_note = 69 + 12 * np.log2(frequency / 440.0)
        midi_note_rounded = int(round(midi_note))

        # Convert MIDI note to note name
        note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        octave = (midi_note_rounded // 12) - 1
        note_index = midi_note_rounded % 12

        return f"{note_names[note_index]}{octave}"

    def set_tempo(self, tempo: int):
        """
        Set the tempo (BPM) for rhythm analysis.

        Args:
            tempo: Tempo in beats per minute
        """
        self.tempo = tempo
        print(f"[Analyzer] Tempo set to {tempo} BPM")

    def set_current_note_index(self, note_index: int):
        """
        Set the current note index from the frontend cursor.

        Args:
            note_index: Index of the note currently being played (from OSMD cursor)
        """
        if 0 <= note_index < len(self.expected_notes):
            self.current_note_index = note_index
            print(f"[Analyzer] Note index updated to {note_index} (pitch: {self.expected_notes[note_index]['pitch']})")
        else:
            print(f"[Analyzer] Warning: Invalid note index {note_index} (max: {len(self.expected_notes) - 1})")

    def analyze_chunk(self, chunk: bytes) -> Dict[str, Any]:
        """
        Analyze an audio chunk in the context of the excerpt.

        Args:
            chunk: Raw audio bytes

        Returns:
            Analysis results with performance feedback
        """
        # Get basic audio analysis
        analysis = self.audio_analyzer.add_audio_chunk(chunk)

        # Add excerpt-specific analysis if we have the score loaded and a note index is set
        # Only send accuracy data AFTER onset has been detected to prevent premature coloring
        if (self.expected_notes and
            0 <= self.current_note_index < len(self.expected_notes) and
            analysis.get("pitch_hz") and
            self.audio_analyzer.onset_detected):  # Only after onset!

            detected_freq = float(analysis["pitch_hz"])
            expected_note = self.expected_notes[self.current_note_index]
            expected_freq = float(expected_note["frequency"])

            # Calculate pitch accuracy (cents off)
            # cents = 1200 * log2(detected / expected)
            cents_off = 1200 * np.log2(detected_freq / expected_freq)

            # Determine accuracy level with more nuanced feedback
            abs_cents = abs(cents_off)
            if abs_cents <= 10:
                accuracy_level = "excellent"  # Very close, professional level
                is_accurate = True
            elif abs_cents <= 25:
                accuracy_level = "good"       # Good intonation, acceptable
                is_accurate = True
            elif abs_cents <= 50:
                accuracy_level = "fair"       # Noticeable but not terrible
                is_accurate = True
            elif abs_cents <= 100:
                accuracy_level = "poor"       # Clearly off pitch
                is_accurate = False
            else:
                accuracy_level = "very_poor"  # Way off, wrong note territory
                is_accurate = False

            # Determine if it's the right note (within reasonable semitone range)
            # Allow up to 75 cents off before considering it the wrong note
            is_right_note = abs_cents <= 75

            # Convert detected frequency back to note name for logging
            detected_note = self._frequency_to_note(detected_freq)

            # Only log on onset detection to avoid spam, but always include the data
            if analysis.get("onset_detected"):
                print(f"[Analyzer] Note {self.current_note_index}: Detected {detected_note} ({detected_freq:.1f} Hz), "
                      f"Expected {expected_note['pitch']} ({expected_freq:.1f} Hz), "
                      f"Cents off: {cents_off:.1f}, Accuracy: {accuracy_level}")

            analysis["expected_pitch"] = expected_note["pitch"]
            analysis["expected_frequency"] = expected_freq
            analysis["cents_off"] = float(cents_off)
            analysis["pitch_accurate"] = bool(is_accurate)
            analysis["accuracy_level"] = accuracy_level
            analysis["is_right_note"] = bool(is_right_note)
            analysis["current_note_index"] = int(self.current_note_index)
            analysis["detected_note"] = detected_note

        return analysis

    def get_final_report(self) -> Dict[str, Any]:
        """
        Generate final performance report.

        Returns:
            Comprehensive analysis of the performance
        """
        summary = self.audio_analyzer.get_summary()

        # Add excerpt-specific metrics
        summary["excerpt_id"] = self.excerpt_id

        if self.excerpt:
            summary["excerpt_title"] = self.excerpt.title
            summary["excerpt_composer"] = self.excerpt.composer
            summary["excerpt_tempo"] = self.excerpt.tempo

        # Add score comparison metrics
        summary["total_notes_in_score"] = len(self.expected_notes)
        summary["notes_played"] = self.current_note_index

        # Calculate completion percentage
        if self.expected_notes:
            completion = (self.current_note_index / len(self.expected_notes)) * 100
            summary["completion_percentage"] = round(completion, 1)
        else:
            summary["completion_percentage"] = 0

        return summary

    def reset(self):
        """Reset the analyzer for a new performance."""
        self.audio_analyzer.reset()
        self.current_note_index = 0

