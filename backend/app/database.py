from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool
from app.config import get_settings

settings = get_settings()

# SQLite needs connect_args for async; pool_pre_ping not supported
connect_args = {}
engine_kw = {"echo": settings.debug}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    engine_kw["connect_args"] = connect_args
    engine_kw["poolclass"] = StaticPool
else:
    engine_kw["pool_pre_ping"] = True

engine = create_async_engine(settings.database_url, **engine_kw)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
