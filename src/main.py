import sys
import os
import asyncio
import contextlib
from time import time
from collections import defaultdict, deque
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.append(str(root_dir))

from fastapi import FastAPI, HTTPException, Depends, Query, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from src.db.database import get_db, Database
from src.schemas.weather import (
    Location, LocationCreate, LocationUpdate, 
    WeatherSnapshot, ForecastItem, WeatherData,
    Preference, PreferenceUpdate, LocationSearchResult,
    LocationWeatherOverview, SystemStatus
)
from src.api.weather_client import WeatherAPIClient, WeatherAPIError
from src.services.weather_service import WeatherService
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=root_dir / ".env")

from contextlib import asynccontextmanager
from datetime import datetime, timezone

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema
    db = get_db()
    db.initialize_schema()
    app.state.sync_task = asyncio.create_task(periodic_sync_loop(db))
    yield
    sync_task = getattr(app.state, "sync_task", None)
    if sync_task:
        sync_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sync_task

app = FastAPI(title="Weather Data Integration Platform", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _get_api_key() -> Optional[str]:
    raw = os.getenv("OPENWEATHER_API_KEY")
    if raw is None:
        return None
    key = raw.strip().strip('"').strip("'")
    return key or None

# API Key check
API_KEY = _get_api_key()
if not API_KEY:
    print("Warning: OPENWEATHER_API_KEY not found in environment variables.")

RATE_LIMIT_REQUESTS = int(os.getenv("API_RATE_LIMIT_REQUESTS", "120"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("API_RATE_LIMIT_WINDOW_SECONDS", "60"))
_rate_limit_buckets = defaultdict(deque)

# Dependency injection for services
def get_weather_service(db: Database = Depends(get_db)):
    client = WeatherAPIClient(api_key=_get_api_key())
    return WeatherService(db, client)

async def periodic_sync_loop(db: Database):
    while True:
        try:
            api_key = _get_api_key()
            if not api_key:
                await asyncio.sleep(60)
                continue

            service = WeatherService(db, WeatherAPIClient(api_key=api_key))
            try:
                locations = service.get_all_locations()
                refresh_interval = 600
                for pref in service.get_preferences():
                    if pref.get("key") == "refresh_interval":
                        try:
                            refresh_interval = max(60, int(str(pref.get("value"))))
                        except ValueError:
                            refresh_interval = 600

                for location in locations:
                    try:
                        await service.sync_weather(location.id, force=True)
                    except Exception:
                        continue
            finally:
                await service.api_client.close()
            await asyncio.sleep(refresh_interval)
        except asyncio.CancelledError:
            raise
        except Exception:
            await asyncio.sleep(60)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path in {"/docs", "/openapi.json", "/redoc"}:
        return await call_next(request)

    client_host = request.client.host if request.client else "unknown"
    bucket = _rate_limit_buckets[client_host]
    now = time()
    while bucket and now - bucket[0] > RATE_LIMIT_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT_REQUESTS:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Please retry shortly."},
        )
    bucket.append(now)
    return await call_next(request)

@app.get("/")
async def root():
    return {
        "message": "Weather Data Integration Platform API",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }


@app.post("/locations", response_model=Location)
async def create_location(
    location: LocationCreate, 
    service: WeatherService = Depends(get_weather_service)
):
    try:
        return await service.add_location(location)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except WeatherAPIError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create location: {e}")

@app.get("/locations", response_model=List[Location])
async def get_locations(service: WeatherService = Depends(get_weather_service)):
    return service.get_all_locations()

@app.get("/locations/overview", response_model=List[LocationWeatherOverview])
async def get_locations_overview(service: WeatherService = Depends(get_weather_service)):
    return service.get_locations_overview()

@app.get("/system/status", response_model=SystemStatus)
async def get_system_status(service: WeatherService = Depends(get_weather_service)):
    return service.get_system_status()

@app.get("/locations/search", response_model=List[LocationSearchResult])
async def search_locations(
    q: str = Query(..., min_length=2, description="City name search query"),
    country: Optional[str] = Query(None, description="Optional country code"),
    service: WeatherService = Depends(get_weather_service),
):
    try:
        return await service.search_locations(q, country)
    except WeatherAPIError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Location search failed: {e}")

@app.get("/locations/{location_id}", response_model=Location)
async def get_location(
    location_id: int, 
    service: WeatherService = Depends(get_weather_service)
):
    loc = service.get_location(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc

@app.patch("/locations/{location_id}", response_model=Location)
async def update_location(
    location_id: int, 
    update: LocationUpdate, 
    service: WeatherService = Depends(get_weather_service)
):
    loc = service.update_location(location_id, update)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc

@app.delete("/locations/{location_id}")
async def delete_location(
    location_id: int, 
    service: WeatherService = Depends(get_weather_service)
):
    if not service.delete_location(location_id):
        raise HTTPException(status_code=404, detail="Location not found")
    return {"status": "deleted"}

@app.post("/locations/{location_id}/sync", response_model=WeatherData)
async def sync_weather(
    location_id: int, 
    force: bool = Query(True, description="Force refresh from API"),
    service: WeatherService = Depends(get_weather_service)
):
    try:
        current, forecast, sync_note = await service.sync_weather(location_id, force=force)
        location = service.get_location(location_id)
        if not location:
            raise HTTPException(status_code=404, detail="Location record missing after sync")
            
        last_synced = service.get_last_sync_time(location_id)
        insights = service.build_weather_insights(location_id, current, forecast)
        return WeatherData(
            location=location,
            current=current,
            forecast=forecast,
            last_synced=last_synced,
            insights=insights,
            sync_note=sync_note,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except WeatherAPIError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        import traceback
        print(f"Sync error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Satellite sync failed: {str(e) or type(e).__name__}")

@app.get("/locations/{location_id}/history", response_model=List[WeatherSnapshot])
async def get_weather_history(
    location_id: int,
    days: int = Query(5, ge=1, le=30, description="Number of previous days"),
    source: str = Query("auto", pattern="^(auto|api|local)$", description="History source mode"),
    response: Response = None,
    service: WeatherService = Depends(get_weather_service),
):
    location = service.get_location(location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    try:
        prefer_api = source in {"auto", "api"}
        if source == "local":
            prefer_api = False
        history_rows, used_source = await service.get_weather_history(location_id, days=days, prefer_api=prefer_api)
        if response is not None:
            response.headers["X-History-Source"] = used_source
        return history_rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"History retrieval failed: {e}")

@app.get("/locations/{location_id}/export", response_model=dict)
async def export_location_data(
    location_id: int,
    history_days: int = Query(30, ge=1, le=365, description="How many days of history to include"),
    service: WeatherService = Depends(get_weather_service),
):
    try:
        payload = service.export_location_data(location_id, history_days=history_days)
        return {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "history_days": history_days,
            **payload,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")

@app.get("/locations/{location_id}/weather", response_model=WeatherData)
async def get_weather_data(
    location_id: int, 
    service: WeatherService = Depends(get_weather_service)
):
    location = service.get_location(location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    
    current = service.get_latest_weather(location_id)
    forecast = service.get_forecast(location_id)
    last_synced = service.get_last_sync_time(location_id)
    insights = service.build_weather_insights(location_id, current, forecast)
    
    return WeatherData(
        location=location,
        current=current,
        forecast=forecast,
        last_synced=last_synced,
        insights=insights,
        sync_note=service.get_last_sync_note(location_id),
    )

@app.get("/preferences", response_model=List[Preference])
async def get_preferences(service: WeatherService = Depends(get_weather_service)):
    return service.get_preferences()

@app.patch("/preferences/{key}", response_model=dict)
async def update_preference(
    key: str, 
    update: PreferenceUpdate, 
    service: WeatherService = Depends(get_weather_service)
):
    service.update_preference(key, update.value)
    return {"status": "updated", "key": key, "value": update.value}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
