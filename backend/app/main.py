import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logging.getLogger("app.services.llm_service").setLevel(logging.DEBUG)

from app.config import settings
from app.database import engine, Base
from app.models import *  # noqa: F401,F403 — ensure all models are imported for table creation

from app.routers import auth, users, classes, topics, exercises, materials, submissions, chat, progress, code


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_chat_message_verdict_column(conn)
        await _ensure_chat_message_version_id_column(conn)
        await _ensure_topic_unlock_mode_column(conn)
    # Seed admin user if no users exist
    await _seed_admin()
    yield


async def _ensure_chat_message_verdict_column(conn):
    result = await conn.execute(text("PRAGMA table_info(chat_messages)"))
    columns = {row[1] for row in result.fetchall()}
    if "verdict" not in columns:
        await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN verdict VARCHAR(20)"))


async def _ensure_chat_message_version_id_column(conn):
    result = await conn.execute(text("PRAGMA table_info(chat_messages)"))
    columns = {row[1] for row in result.fetchall()}
    if "version_id" not in columns:
        await conn.execute(text("ALTER TABLE chat_messages ADD COLUMN version_id INTEGER REFERENCES submission_versions(id)"))


async def _ensure_topic_unlock_mode_column(conn):
    result = await conn.execute(text("PRAGMA table_info(topics)"))
    columns = {row[1] for row in result.fetchall()}
    if "unlock_mode" not in columns:
        await conn.execute(text("ALTER TABLE topics ADD COLUMN unlock_mode VARCHAR(20) NOT NULL DEFAULT 'auto'"))


async def _seed_admin():
    from sqlalchemy import select
    from app.database import async_session
    from app.models.user import User, UserRole
    from app.utils.security import hash_password

    async with async_session() as session:
        result = await session.execute(select(User).limit(1))
        if result.scalar_one_or_none() is None:
            admin = User(
                username="admin",
                password_hash=hash_password("admin"),
                full_name="Administrador",
                role=UserRole.admin,
            )
            session.add(admin)
            await session.commit()


app = FastAPI(title="pylamos", version="0.1.0", lifespan=lifespan, redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(classes.router)
app.include_router(topics.router)
app.include_router(exercises.router)
app.include_router(materials.router)
app.include_router(submissions.router)
app.include_router(chat.router)
app.include_router(progress.router)
app.include_router(code.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
