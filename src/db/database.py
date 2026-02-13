"""Database connection and session management."""
import sqlite3
from pathlib import Path
from typing import Optional
import os


class Database:
    """SQLite database connection manager."""
    
    def __init__(self, db_path: Optional[str] = None):
        """Initialize database connection.
        
        Args:
            db_path: Path to SQLite database file. Defaults to './database/weather.db'
        """
        if db_path is None:
            db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'database', 'weather.db')
        
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._connection: Optional[sqlite3.Connection] = None
    
    def connect(self) -> sqlite3.Connection:
        """Get database connection with row factory."""
        if self._connection is None:
            self._connection = sqlite3.connect(
                self.db_path,
                check_same_thread=False,
                detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES
            )
            self._connection.row_factory = sqlite3.Row
            # Enable foreign keys
            self._connection.execute("PRAGMA foreign_keys = ON")
        return self._connection
    
    def close(self):
        """Close database connection."""
        if self._connection:
            self._connection.close()
            self._connection = None
    
    def initialize_schema(self):
        """Initialize database schema from init.sql file."""
        schema_path = self.db_path.parent / 'init.sql'
        if not schema_path.exists():
            raise FileNotFoundError(f"Schema file not found: {schema_path}")
        
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        
        conn = self.connect()
        conn.executescript(schema_sql)
        # Backward-compatible migration for existing databases.
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(locations)").fetchall()
        }
        if "is_deleted" not in columns:
            conn.execute(
                "ALTER TABLE locations ADD COLUMN is_deleted BOOLEAN DEFAULT 0"
            )
        conn.commit()
    
    def execute(self, query: str, params: tuple = ()):
        """Execute a query and return cursor.
        
        Args:
            query: SQL query string
            params: Query parameters tuple
            
        Returns:
            Cursor object
        """
        conn = self.connect()
        return conn.execute(query, params)
    
    def execute_many(self, query: str, params_list: list):
        """Execute a query multiple times with different parameters.
        
        Args:
            query: SQL query string
            params_list: List of parameter tuples
        """
        conn = self.connect()
        conn.executemany(query, params_list)
        conn.commit()
    
    def commit(self):
        """Commit current transaction."""
        if self._connection:
            self._connection.commit()
    
    def rollback(self):
        """Rollback current transaction."""
        if self._connection:
            self._connection.rollback()


# Global database instance
db = Database()


def get_db() -> Database:
    """Dependency injection for FastAPI routes."""
    return db
