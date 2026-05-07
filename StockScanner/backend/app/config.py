from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    PG_HOST: str = "localhost"
    PG_PORT: int = 5432
    PG_USER: str = "postgres"
    PG_PASSWORD: str = ""
    PG_DB: str = "scanner_db"

    POLYGON_API_KEY: str = ""

    SCANNER_DATA_FILE: Path = BACKEND_DIR.parent / "scanner_v2" / "logs" / "scanner_data.json"

    FRONTEND_ORIGIN: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def pg_dsn(self) -> str:
        return (
            f"host={self.PG_HOST} port={self.PG_PORT} "
            f"user={self.PG_USER} password={self.PG_PASSWORD} dbname={self.PG_DB}"
        )

    @property
    def pg_dsn_admin(self) -> str:
        return (
            f"host={self.PG_HOST} port={self.PG_PORT} "
            f"user={self.PG_USER} password={self.PG_PASSWORD} dbname=postgres"
        )


settings = Settings()
