from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json

router = APIRouter(prefix="/ws", tags=["websocket"])


@router.websocket("/audio/{excerpt_id}/{session_id}")
async def websocket_audio(websocket: WebSocket, excerpt_id: str, session_id: str):
    """Accept binary audio frames from a specific user session and reply with simple JSON feedback.

    Each user gets a unique session_id to prevent conflicts when multiple users
    practice the same excerpt simultaneously.
    """
    await websocket.accept()
    print(
        f"WebSocket connection accepted for excerpt: {excerpt_id}, session: {session_id}"
    )

    try:
        while True:
            msg = await websocket.receive()
            msg_type = msg.get("type")

            if msg_type == "websocket.receive":
                # Binary frames (ArrayBuffer) will be provided in the 'bytes' field
                if "bytes" in msg and msg["bytes"] is not None:
                    chunk = msg["bytes"]
                    # For now, just acknowledge receipt and report the length
                    ack = {"status": "received", "bytes": len(chunk)}
                    await websocket.send_text(json.dumps(ack))
                elif "text" in msg and msg["text"] is not None:
                    # If the client sends text control messages, echo or ACK them
                    try:
                        payload = json.loads(msg["text"])
                        ack = {"status": "ok", "payload": payload}
                    except Exception:
                        ack = {"status": "ok", "text": msg["text"]}
                    await websocket.send_text(json.dumps(ack))

            elif msg_type == "websocket.disconnect":
                print(
                    f"WebSocket disconnected for excerpt: {excerpt_id}, session: {session_id}"
                )
                break

    except WebSocketDisconnect:
        print(
            f"Client disconnected from audio websocket for excerpt: {excerpt_id}, session: {session_id}"
        )
    except Exception as e:
        print(f"Error in audio websocket for {excerpt_id}, session: {session_id}: {e}")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
