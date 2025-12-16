from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import excerpts

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(excerpts.router)


@app.get("/test")
def test_endpoint():
    return {"message": "Hello from FastAPI!"}
