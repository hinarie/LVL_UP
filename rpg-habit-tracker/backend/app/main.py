from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.database import engine
from app import models
from app.routers import (
    auth, tasks, character, goals, habits, shop,
    social, challenges, oauth, profile,
)
from app.services.shop_seed import seed_shop
from app.database import AsyncSessionLocal

app = FastAPI(title="RPG Habit Tracker API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(oauth.router)
app.include_router(tasks.router)
app.include_router(character.router)
app.include_router(goals.router)
app.include_router(habits.router)
app.include_router(shop.router)
app.include_router(social.router)
app.include_router(challenges.router)
app.include_router(profile.router)

FRONTEND_PATH = Path(__file__).resolve().parent.parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(FRONTEND_PATH), html=True), name="frontend")


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        await seed_shop(db)