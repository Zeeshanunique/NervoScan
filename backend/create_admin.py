"""
Script to create an admin user for NervoScan.
"""
import asyncio
import uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from passlib.context import CryptContext

from app.models.assessment import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DATABASE_URL = "sqlite+aiosqlite:///./nervoscan.db"

async def create_admin_user(email: str, password: str, name: str = "Admin"):
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == email))
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"User {email} already exists")
            if not existing.is_admin:
                existing.is_admin = True
                await session.commit()
                print(f"✅ Updated {email} to admin")
            else:
                print(f"Already admin")
            return
        
        password_bytes = password.encode('utf-8')[:72]
        hashed = pwd_context.hash(password_bytes.decode('utf-8'))
        
        user = User(
            id=uuid.uuid4(),
            anonymous_id=f"admin-{uuid.uuid4()}",
            email=email,
            name=name,
            password_hash=hashed,
            is_admin=True,
        )
        session.add(user)
        await session.commit()
        print(f"✅ Created admin user: {email}")
    
    await engine.dispose()

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python create_admin.py <email> <password> [name]")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else "Admin"
    
    asyncio.run(create_admin_user(email, password, name))
