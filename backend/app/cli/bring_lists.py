import asyncio

from app.core.config import get_settings
from app.providers.bring import BringProvider


async def main() -> None:
    settings = get_settings()
    if not settings.bring_enabled or not settings.bring_email or not settings.bring_password:
        raise SystemExit("BRING_ENABLED, BRING_EMAIL und BRING_PASSWORD müssen gesetzt sein.")
    provider = BringProvider(settings)
    try:
        for name, list_uuid in await provider.list_lists():
            print(f"{name}: {list_uuid}")
    finally:
        await provider.close()


if __name__ == "__main__":
    asyncio.run(main())
