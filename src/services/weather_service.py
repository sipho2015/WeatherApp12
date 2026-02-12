from typing import List, Optional, Tuple
from datetime import datetime
from src.db.database import Database
from src.schemas.weather import Location, WeatherSnapshot, ForecastItem, LocationCreate, LocationUpdate
from src.api.weather_client import WeatherAPIClient
import json

class WeatherService:
    def __init__(self, db: Database, api_client: WeatherAPIClient):
        self.db = db
        self.api_client = api_client

    async def add_location(self, location_data: LocationCreate) -> Location:
        # 1. Get coordinates from API
        geo_results = await self.api_client.get_location_coords(location_data.name, location_data.country)
        if not geo_results:
            raise ValueError(f"Location not found: {location_data.name}")
        
        best_match = geo_results[0]
        
        # 2. Store in DB
        query = """
            INSERT INTO locations (name, country, latitude, longitude, display_name)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *
        """
        cursor = self.db.execute(query, (
            best_match["name"],
            best_match["country"],
            best_match["lat"],
            best_match["lon"],
            best_match["name"]
        ))
        row = cursor.fetchone()
        self.db.commit()
        return Location(**dict(row))

    def get_all_locations(self) -> List[Location]:
        cursor = self.db.execute("SELECT * FROM locations ORDER BY is_favorite DESC, name ASC")
        return [Location(**dict(row)) for row in cursor.fetchall()]

    def get_location(self, location_id: int) -> Optional[Location]:
        cursor = self.db.execute("SELECT * FROM locations WHERE id = ?", (location_id,))
        row = cursor.fetchone()
        return Location(**dict(row)) if row else None

    def update_location(self, location_id: int, update_data: LocationUpdate) -> Optional[Location]:
        updates = []
        params = []
        if update_data.display_name is not None:
            updates.append("display_name = ?")
            params.append(update_data.display_name)
        if update_data.is_favorite is not None:
            updates.append("is_favorite = ?")
            params.append(1 if update_data.is_favorite else 0)
        
        if not updates:
            return self.get_location(location_id)
            
        params.append(location_id)
        query = f"UPDATE locations SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        self.db.execute(query, tuple(params))
        self.db.commit()
        
        # Fetch the updated record
        cursor = self.db.execute("SELECT * FROM locations WHERE id = ?", (location_id,))
        row = cursor.fetchone()
        return Location(**dict(row)) if row else None

    def delete_location(self, location_id: int) -> bool:
        cursor = self.db.execute("DELETE FROM locations WHERE id = ?", (location_id,))
        self.db.commit()
        return cursor.rowcount > 0

    async def sync_weather(self, location_id: int) -> Tuple[WeatherSnapshot, List[ForecastItem]]:
        location = self.get_location(location_id)
        if not location:
            raise ValueError("Location not found")
        
        # Get units preference
        cursor = self.db.execute("SELECT value FROM user_preferences WHERE key = 'units'")
        row = cursor.fetchone()
        units = row["value"] if row else "metric"
        
        try:
            # Fetch current and forecast
            current = await self.api_client.get_current_weather(location.latitude, location.longitude, units=units)
            forecast = await self.api_client.get_forecast(location.latitude, location.longitude, units=units)
            
            # Store current weather
            self.db.execute("""
                INSERT INTO weather_snapshots (
                    location_id, temperature, feels_like, temp_min, temp_max, 
                    pressure, humidity, weather_main, weather_description, 
                    weather_icon, wind_speed, wind_deg, clouds, visibility, api_timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                location_id, current.temperature, current.feels_like, current.temp_min, current.temp_max,
                current.pressure, current.humidity, current.weather_main, current.weather_description,
                current.weather_icon, current.wind_speed, current.wind_deg, current.clouds, 
                current.visibility, current.api_timestamp
            ))
            
            # Update forecasts (clear old ones first for this location)
            self.db.execute("DELETE FROM forecasts WHERE location_id = ?", (location_id,))
            
            for item in forecast:
                self.db.execute("""
                    INSERT INTO forecasts (
                        location_id, forecast_timestamp, temperature, feels_like, 
                        temp_min, temp_max, pressure, humidity, weather_main, 
                        weather_description, weather_icon, wind_speed, wind_deg, clouds, pop
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    location_id, item.forecast_timestamp, item.temperature, item.feels_like,
                    item.temp_min, item.temp_max, item.pressure, item.humidity, item.weather_main,
                    item.weather_description, item.weather_icon, item.wind_speed, item.wind_deg,
                    item.clouds, item.pop
                ))
            
            # Record sync history
            self.db.execute("""
                INSERT INTO sync_history (location_id, sync_type, status)
                VALUES (?, 'all', 'success')
            """, (location_id,))
            
            self.db.commit()
            return current, forecast
            
        except Exception as e:
            self.db.execute("""
                INSERT INTO sync_history (location_id, sync_type, status, error_message)
                VALUES (?, 'all', 'failed', ?)
            """, (location_id, str(e)))
            self.db.commit()
            raise e

    def get_latest_weather(self, location_id: int) -> Optional[WeatherSnapshot]:
        cursor = self.db.execute("""
            SELECT * FROM weather_snapshots 
            WHERE location_id = ? 
            ORDER BY timestamp DESC LIMIT 1
        """, (location_id,))
        row = cursor.fetchone()
        return WeatherSnapshot(**dict(row)) if row else None

    def get_forecast(self, location_id: int) -> List[ForecastItem]:
        cursor = self.db.execute("""
            SELECT * FROM forecasts 
            WHERE location_id = ? 
            ORDER BY forecast_timestamp ASC
        """, (location_id,))
        return [ForecastItem(**dict(row)) for row in cursor.fetchall()]

    def get_last_sync_time(self, location_id: int) -> Optional[datetime]:
        cursor = self.db.execute("""
            SELECT synced_at FROM sync_history 
            WHERE location_id = ? AND status = 'success'
            ORDER BY synced_at DESC LIMIT 1
        """, (location_id,))
        row = cursor.fetchone()
        return row["synced_at"] if row else None

    def get_preferences(self) -> List[dict]:
        cursor = self.db.execute("SELECT key, value FROM user_preferences")
        return [dict(row) for row in cursor.fetchall()]

    def update_preference(self, key: str, value: str):
        self.db.execute(
            "UPDATE user_preferences SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
            (value, key)
        )
        self.db.commit()
