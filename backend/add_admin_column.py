"""
Add is_admin column to users table.
Run this script to migrate your Railway PostgreSQL database.

Usage:
    python add_admin_column.py
"""
import asyncio
from sqlalchemy import text
from app.database import engine, async_session


async def add_admin_column():
    """Add is_admin column to users table if it doesn't exist."""
    async with engine.begin() as conn:
        # Check if column exists
        result = await conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='is_admin'
        """))
        
        exists = result.fetchone() is not None
        
        if exists:
            print("✅ is_admin column already exists!")
            return
        
        # Add the column
        await conn.execute(text("""
            ALTER TABLE users 
            ADD COLUMN is_admin BOOLEAN DEFAULT FALSE
        """))
        
        print("✅ is_admin column added successfully!")
        print("ℹ️  All existing users have is_admin=FALSE by default.")
        print("💡 Use create_admin.py to create admin users.")


if __name__ == "__main__":
    asyncio.run(add_admin_column())
