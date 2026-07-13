from httpx import AsyncClient


async def test_health_endpoint_reports_components_without_secrets(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert set(payload["components"]) == {
        "backend",
        "database",
        "weather_provider",
        "calendar_provider",
    }
    serialized = response.text.lower()
    assert "password" not in serialized
    assert ".ics" not in serialized
