from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from app.services.analysis_service import PerformanceAnalyzer

router = APIRouter(prefix="/ws", tags=["websocket"])


@router.websocket("/audio/{excerpt_id}/{session_id}")
async def websocket_audio(websocket: WebSocket, excerpt_id: str, session_id: str):
    """Accept binary audio frames from a specific user session and analyze the performance.

    Each user gets a unique session_id to prevent conflicts when multiple users
    practice the same excerpt simultaneously.

    The audio is analyzed in real-time for:
    - Pitch detection
    - Note onset detection
    - Volume/dynamics
    - (Future) Pitch accuracy vs. score
    - (Future) Rhythm accuracy vs. score
    """
    try:
        await websocket.accept()
        print(f"WebSocket connected: {excerpt_id}, session: {session_id}")

        # Create analyzer for this session
        analyzer = PerformanceAnalyzer(excerpt_id)
    except Exception as e:
        print(f"Error initializing WebSocket: {e}")
        import traceback
        traceback.print_exc()
        try:
            await websocket.close(code=1011, reason=f"Initialization error: {str(e)}")
        except:
            pass
        return

    try:
        while True:
            msg = await websocket.receive()
            msg_type = msg.get("type")

            if msg_type == "websocket.receive":
                # Binary frames (ArrayBuffer) will be provided in the 'bytes' field
                if "bytes" in msg and msg["bytes"] is not None:
                    chunk = msg["bytes"]

                    try:
                        # Analyze the audio chunk
                        analysis = analyzer.analyze_chunk(chunk)

                        # Send analysis results back to client
                        response = {
                            "status": "analyzed",
                            "bytes_received": len(chunk),
                            "analysis": analysis
                        }
                        await websocket.send_text(json.dumps(response))

                    except Exception as e:
                        print(f"Error analyzing chunk: {e}")
                        # Send error response but keep connection alive
                        error_response = {
                            "status": "error",
                            "message": str(e)
                        }
                        await websocket.send_text(json.dumps(error_response))

                elif "text" in msg and msg["text"] is not None:
                    # Handle text control messages
                    try:
                        payload = json.loads(msg["text"])

                        # Handle special commands
                        if payload.get("command") == "get_summary":
                            # Return performance summary
                            summary = analyzer.get_final_report()
                            response = {
                                "status": "summary",
                                "data": summary
                            }
                            await websocket.send_text(json.dumps(response))

                        elif payload.get("command") == "reset":
                            # Reset analyzer
                            analyzer.reset()
                            response = {"status": "reset", "message": "Analyzer reset"}
                            await websocket.send_text(json.dumps(response))

                        elif payload.get("command") == "set_note_index":
                            # Update current note index from frontend cursor
                            note_index = payload.get("note_index", 0)
                            print(f"[Backend] Received set_note_index: {note_index}")
                            analyzer.set_current_note_index(note_index)
                            # No need to send response, just acknowledge silently

                        elif payload.get("command") == "set_tempo":
                            # Store tempo from frontend (for future rhythm analysis)
                            tempo = payload.get("tempo", 120)
                            print(f"[Backend] Received tempo: {tempo} BPM")
                            analyzer.set_tempo(tempo)
                            # No need to send response, just acknowledge silently

                        else:
                            # Generic acknowledgment
                            ack = {"status": "ok", "payload": payload}
                            await websocket.send_text(json.dumps(ack))

                    except Exception as e:
                        error_response = {"status": "error", "message": str(e)}
                        await websocket.send_text(json.dumps(error_response))

            elif msg_type == "websocket.disconnect":
                final_report = analyzer.get_final_report()
                print(f"WebSocket disconnected: {session_id}")
                print(f"Final report: {final_report}")
                break

    except WebSocketDisconnect:
        final_report = analyzer.get_final_report()
        print(f"WebSocket disconnected: {session_id}")
        print(f"Final report: {final_report}")
    except Exception as e:
        print(f"Error in audio websocket for {excerpt_id}, session: {session_id}: {e}")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
