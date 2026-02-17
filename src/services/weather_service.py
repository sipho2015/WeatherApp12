from typing import List, Optional, Tuple
from datetime import datetime, timedelta
import logging
import os
import pycountry
from src.db.database import Database
from src.schemas.weather import (
    Location,
    WeatherSnapshot,
    ForecastItem,
    LocationCreate,
    LocationUpdate,
    LocationSearchResult,
    WeatherInsights,
    ForecastConfidence,
    DailyImpactScores,
    InsightTimelineEvent,
    ForecastChangeSummary,
    LocationWeatherOverview,
    SystemStatus,
)
from src.api.weather_client import WeatherAPIClient

logger = logging.getLogger(__name__)

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

        name = best_match["name"]
        country = best_match["country"]
        lat = best_match["lat"]
        lon = best_match["lon"]

        # 2. Reuse existing record if same city was previously soft-deleted.
        existing_cursor = self.db.execute(
            "SELECT * FROM locations WHERE name = ? AND country = ? LIMIT 1",
            (name, country),
        )
        existing = existing_cursor.fetchone()
        if existing:
            self.db.execute(
                """
                UPDATE locations
                SET latitude = ?, longitude = ?, display_name = ?, is_deleted = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (lat, lon, name, existing["id"]),
            )
            self.db.commit()
            row = self.db.execute(
                "SELECT * FROM locations WHERE id = ? AND is_deleted = 0",
                (existing["id"],),
            ).fetchone()
            location = Location(**dict(row))
            try:
                await self.sync_weather(location.id, force=True)
            except Exception as exc:
                logger.warning("Auto-sync failed for location %s: %s", location.id, exc)
            return location

        # 3. Store new location
        query = """
            INSERT INTO locations (name, country, latitude, longitude, display_name)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *
        """
        cursor = self.db.execute(query, (name, country, lat, lon, name))
        row = cursor.fetchone()
        self.db.commit()
        location = Location(**dict(row))
        try:
            await self.sync_weather(location.id, force=True)
        except Exception as exc:
            logger.warning("Auto-sync failed for location %s: %s", location.id, exc)
        return location

    async def search_locations(self, query: str, country: Optional[str] = None) -> List[LocationSearchResult]:
        # Guard: if user entered a country name/code without a specific city query,
        # return no results to avoid misleading geo matches from global dataset.
        if self._looks_like_country_only_query(query):
            return []

        geo_results = await self.api_client.get_location_coords(query, country)
        results: List[LocationSearchResult] = []
        for item in geo_results:
            display_name = f"{item['name']}, {item['country']}"
            if item.get("state"):
                display_name = f"{item['name']}, {item['state']}, {item['country']}"

            results.append(
                LocationSearchResult(
                    name=item["name"],
                    country=item["country"],
                    state=item.get("state"),
                    latitude=item["lat"],
                    longitude=item["lon"],
                    display_name=display_name,
                )
            )
        return results

    def _looks_like_country_only_query(self, query: str) -> bool:
        q = query.strip().lower()
        if len(q) < 2:
            return False

        for country in pycountry.countries:
            name = getattr(country, "name", "").strip().lower()
            official = getattr(country, "official_name", "").strip().lower()
            alpha2 = getattr(country, "alpha_2", "").strip().lower()
            alpha3 = getattr(country, "alpha_3", "").strip().lower()
            if q in {name, official, alpha2, alpha3}:
                return True
        return False

    def get_all_locations(self) -> List[Location]:
        cursor = self.db.execute(
            "SELECT * FROM locations WHERE is_deleted = 0 ORDER BY is_favorite DESC, name ASC"
        )
        return [Location(**dict(row)) for row in cursor.fetchall()]

    def get_location(self, location_id: int) -> Optional[Location]:
        cursor = self.db.execute(
            "SELECT * FROM locations WHERE id = ? AND is_deleted = 0",
            (location_id,),
        )
        row = cursor.fetchone()
        return Location(**dict(row)) if row else None

    def get_locations_overview(self) -> List[LocationWeatherOverview]:
        locations = self.get_all_locations()
        output: List[LocationWeatherOverview] = []
        for location in locations:
            output.append(
                LocationWeatherOverview(
                    location=location,
                    current=self.get_latest_weather(location.id),
                    last_synced=self.get_last_sync_time(location.id),
                )
            )
        return output

    def get_system_status(self) -> SystemStatus:
        total_locations_row = self.db.execute(
            "SELECT COUNT(*) AS count FROM locations WHERE is_deleted = 0"
        ).fetchone()
        total_locations = int(total_locations_row["count"]) if total_locations_row else 0

        synced_locations_row = self.db.execute(
            """
            SELECT COUNT(DISTINCT ws.location_id) AS count
            FROM weather_snapshots ws
            JOIN locations l ON l.id = ws.location_id
            WHERE l.is_deleted = 0
            """
        ).fetchone()
        synced_locations = int(synced_locations_row["count"]) if synced_locations_row else 0

        failed_24h_row = self.db.execute(
            """
            SELECT COUNT(*) AS count
            FROM sync_history
            WHERE status = 'failed'
              AND synced_at >= datetime('now', '-1 day')
            """
        ).fetchone()
        failed_sync_last_24h = int(failed_24h_row["count"]) if failed_24h_row else 0

        last_success = self.db.execute(
            """
            SELECT synced_at
            FROM sync_history
            WHERE status = 'success'
            ORDER BY synced_at DESC
            LIMIT 1
            """
        ).fetchone()
        last_success_sync = None
        if last_success:
            try:
                value = last_success["synced_at"]
                if isinstance(value, datetime):
                    last_success_sync = value
                elif isinstance(value, str):
                    last_success_sync = datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                last_success_sync = None

        return SystemStatus(
            total_locations=total_locations,
            synced_locations=synced_locations,
            failed_sync_last_24h=failed_sync_last_24h,
            last_success_sync=last_success_sync,
            sync_interval_seconds=self._sync_cache_age_seconds(),
            api_configured=bool(
                (getattr(self.api_client, "api_key", None) or os.getenv("OPENWEATHER_API_KEY", ""))
                .strip()
                .strip('"')
                .strip("'")
            ),
        )

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
        query = (
            f"UPDATE locations SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP "
            "WHERE id = ? AND is_deleted = 0"
        )
        self.db.execute(query, tuple(params))
        self.db.commit()
        
        # Fetch the updated record
        cursor = self.db.execute(
            "SELECT * FROM locations WHERE id = ? AND is_deleted = 0",
            (location_id,),
        )
        row = cursor.fetchone()
        return Location(**dict(row)) if row else None

    def delete_location(self, location_id: int) -> bool:
        cursor = self.db.execute(
            """
            UPDATE locations
            SET is_deleted = 1, is_favorite = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND is_deleted = 0
            """,
            (location_id,),
        )
        self.db.commit()
        return cursor.rowcount > 0

    async def sync_weather(
        self,
        location_id: int,
        force: bool = False,
    ) -> Tuple[WeatherSnapshot, List[ForecastItem], Optional[str]]:
        location = self.get_location(location_id)
        if not location:
            raise ValueError("Location not found")

        units = self._get_preference_value("units", "metric")
        cache_age_seconds = self._sync_cache_age_seconds()
        last_sync = self.get_last_sync_time(location_id)
        is_cache_fresh = (
            not force
            and last_sync is not None
            and datetime.utcnow() - last_sync < timedelta(seconds=cache_age_seconds)
        )
        if is_cache_fresh:
            current_cached = self.get_latest_weather(location_id)
            forecast_cached = self.get_forecast(location_id)
            if current_cached and forecast_cached:
                return current_cached, forecast_cached, "Used cached weather data to reduce API calls."
        
        try:
            previous_current = self.get_latest_weather(location_id)
            # Fetch current and forecast
            current = await self.api_client.get_current_weather(location.latitude, location.longitude, units=units)
            forecast = await self.api_client.get_forecast(location.latitude, location.longitude, units=units)
            sync_note = self._detect_conflict_note(previous_current, current)
            
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
                INSERT INTO sync_history (location_id, sync_type, status, error_message)
                VALUES (?, 'all', 'success', ?)
            """, (location_id, sync_note))
            
            self.db.commit()
            return current, forecast, sync_note
            
        except Exception as e:
            self.db.execute("""
                INSERT INTO sync_history (location_id, sync_type, status, error_message)
                VALUES (?, 'all', 'failed', ?)
            """, (location_id, str(e)))
            self.db.commit()
            raise e

    def _detect_conflict_note(
        self,
        previous_current: Optional[WeatherSnapshot],
        next_current: WeatherSnapshot,
    ) -> Optional[str]:
        if not previous_current:
            return None

        temp_delta = abs(next_current.temperature - previous_current.temperature)
        wind_delta = abs(next_current.wind_speed - previous_current.wind_speed)
        weather_changed = next_current.weather_main.lower() != previous_current.weather_main.lower()
        if temp_delta >= 10 or wind_delta >= 10 or weather_changed:
            return (
                "Significant data shift detected; latest API response applied "
                "as source of truth."
            )
        return None

    def get_latest_weather(self, location_id: int) -> Optional[WeatherSnapshot]:
        cursor = self.db.execute("""
            SELECT * FROM weather_snapshots 
            WHERE location_id = ? 
            ORDER BY timestamp DESC LIMIT 1
        """, (location_id,))
        row = cursor.fetchone()
        return WeatherSnapshot(**dict(row)) if row else None

    def _get_previous_latest_weather(self, location_id: int) -> Optional[WeatherSnapshot]:
        cursor = self.db.execute(
            """
            SELECT * FROM weather_snapshots
            WHERE location_id = ?
            ORDER BY timestamp DESC
            LIMIT 1 OFFSET 1
            """,
            (location_id,),
        )
        row = cursor.fetchone()
        return WeatherSnapshot(**dict(row)) if row else None

    def get_forecast(self, location_id: int) -> List[ForecastItem]:
        cursor = self.db.execute("""
            SELECT * FROM forecasts 
            WHERE location_id = ? 
            ORDER BY forecast_timestamp ASC
        """, (location_id,))
        return [ForecastItem(**dict(row)) for row in cursor.fetchall()]

    def _get_weather_history_from_db(self, location_id: int, days: int = 5) -> List[WeatherSnapshot]:
        cursor = self.db.execute(
            """
            SELECT
                temperature, feels_like, temp_min, temp_max, pressure, humidity,
                weather_main, weather_description, weather_icon, wind_speed, wind_deg,
                clouds, visibility, api_timestamp, timestamp
            FROM weather_snapshots
            WHERE location_id = ?
              AND timestamp >= datetime('now', ?)
            ORDER BY timestamp DESC
            """,
            (location_id, f"-{days} days"),
        )
        return [WeatherSnapshot(**dict(row)) for row in cursor.fetchall()]

    async def get_weather_history(
        self,
        location_id: int,
        days: int = 5,
        prefer_api: bool = True
    ) -> Tuple[List[WeatherSnapshot], str]:
        if prefer_api:
            location = self.get_location(location_id)
            if location:
                units = self._get_preference_value("units", "metric")
                try:
                    api_history = await self.api_client.get_historical_weather(
                        location.latitude,
                        location.longitude,
                        days=days,
                        units=units,
                    )
                    if api_history:
                        return api_history, "api"
                except Exception as exc:
                    logger.warning(
                        "Historical API fetch failed for location %s, falling back to local snapshots: %s",
                        location_id,
                        exc,
                    )
        return self._get_weather_history_from_db(location_id, days=days), "local"

    def export_location_data(self, location_id: int, history_days: int = 30) -> dict:
        location = self.get_location(location_id)
        if not location:
            raise ValueError("Location not found")

        current = self.get_latest_weather(location_id)
        forecast = self.get_forecast(location_id)
        history = self._get_weather_history_from_db(location_id, days=history_days)
        last_synced = self.get_last_sync_time(location_id)
        sync_note = self.get_last_sync_note(location_id)

        return {
            "location": location.model_dump(),
            "current": current.model_dump() if current else None,
            "forecast": [item.model_dump() for item in forecast],
            "history": [item.model_dump() for item in history],
            "last_synced": last_synced.isoformat() if last_synced else None,
            "sync_note": sync_note,
        }

    def get_last_sync_time(self, location_id: int) -> Optional[datetime]:
        cursor = self.db.execute("""
            SELECT synced_at FROM sync_history 
            WHERE location_id = ? AND status = 'success'
            ORDER BY synced_at DESC LIMIT 1
        """, (location_id,))
        row = cursor.fetchone()
        if not row:
            return None
        try:
            value = row["synced_at"]
            if isinstance(value, datetime):
                return value
            if isinstance(value, str):
                # SQLite can return text timestamps depending on driver parsing.
                return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
            return None
        except Exception:
            return None

    def get_last_sync_note(self, location_id: int) -> Optional[str]:
        cursor = self.db.execute(
            """
            SELECT error_message FROM sync_history
            WHERE location_id = ? AND status = 'success'
            ORDER BY synced_at DESC LIMIT 1
            """,
            (location_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        try:
            return row["error_message"] if row["error_message"] else None
        except Exception:
            return None

    def get_preferences(self) -> List[dict]:
        cursor = self.db.execute("SELECT key, value FROM user_preferences")
        return [dict(row) for row in cursor.fetchall()]

    def update_preference(self, key: str, value: str):
        self.db.execute(
            "UPDATE user_preferences SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
            (value, key)
        )
        self.db.commit()

    def _get_preference_value(self, key: str, fallback: str) -> str:
        cursor = self.db.execute("SELECT value FROM user_preferences WHERE key = ?", (key,))
        row = cursor.fetchone()
        if row:
            try:
                value = row["value"]
                if value is not None:
                    return str(value)
            except Exception:
                pass
        return fallback

    def _sync_cache_age_seconds(self) -> int:
        refresh_interval = self._get_preference_value("refresh_interval", "600")
        try:
            parsed = int(refresh_interval)
        except ValueError:
            parsed = 600
        return max(60, parsed)

    def build_weather_insights(
        self,
        location_id: int,
        current: Optional[WeatherSnapshot],
        forecast: List[ForecastItem],
    ) -> Optional[WeatherInsights]:
        if not current and not forecast:
            return None

        daily = forecast[0:40:8]
        confidence = [self._build_confidence_item(item) for item in daily]
        impact_scores = self._build_impact_scores(current, forecast)
        timeline = self._build_timeline_events(forecast)
        alerts = self._build_alerts(current, forecast)
        previous_current = self._get_previous_latest_weather(location_id)
        change_summary = self._build_change_summary(previous_current, current, forecast)
        briefing = self._build_briefing(current, forecast, alerts, impact_scores)

        return WeatherInsights(
            briefing=briefing,
            confidence=confidence,
            impact_scores=impact_scores,
            timeline=timeline,
            alerts=alerts,
            change_summary=change_summary,
        )

    def _build_confidence_item(self, item: ForecastItem) -> ForecastConfidence:
        score = 82
        if item.pop >= 0.6:
            score -= 18
        elif item.pop >= 0.3:
            score -= 9

        if item.wind_speed >= 12:
            score -= 14
        elif item.wind_speed >= 8:
            score -= 7

        if item.weather_main.lower() in {"thunderstorm", "squall", "tornado"}:
            score -= 18

        score = max(35, min(95, score))
        if score >= 76:
            label = "High"
        elif score >= 58:
            label = "Medium"
        else:
            label = "Low"

        reason = "stable signals"
        if item.pop >= 0.6:
            reason = "rain risk is high"
        if item.wind_speed >= 12:
            reason = "wind variability is high"
        if item.weather_main.lower() in {"thunderstorm", "squall", "tornado"}:
            reason = "convective conditions expected"

        return ForecastConfidence(label=label, score=score, reason=reason)

    def _build_impact_scores(
        self,
        current: Optional[WeatherSnapshot],
        forecast: List[ForecastItem],
    ) -> DailyImpactScores:
        window = forecast[:8] if forecast else []
        avg_pop = sum(item.pop for item in window) / len(window) if window else 0.0
        avg_wind = sum(item.wind_speed for item in window) / len(window) if window else 0.0
        avg_temp = (
            sum(item.temperature for item in window) / len(window)
            if window and current is None
            else (current.temperature if current else 20.0)
        )

        commute = 100 - int(avg_pop * 45) - int(min(avg_wind, 20) * 1.2)
        outdoor = 100 - int(avg_pop * 55) - int(min(avg_wind, 18) * 1.1)
        laundry = 100 - int(avg_pop * 70) - (20 if avg_temp < 6 else 0)
        running = 100 - int(avg_pop * 40) - int(min(avg_wind, 15) * 1.4)
        if avg_temp > 32:
            running -= 18
            outdoor -= 12
        elif avg_temp < 0:
            running -= 22
            commute -= 10

        return DailyImpactScores(
            commute=max(0, min(100, commute)),
            outdoor=max(0, min(100, outdoor)),
            laundry=max(0, min(100, laundry)),
            running=max(0, min(100, running)),
        )

    def _build_timeline_events(self, forecast: List[ForecastItem]) -> List[InsightTimelineEvent]:
        events: List[InsightTimelineEvent] = []
        for item in forecast[:12]:
            lower_main = item.weather_main.lower()
            if item.pop >= 0.6:
                events.append(
                    InsightTimelineEvent(
                        timestamp=item.forecast_timestamp,
                        title="Rain window",
                        severity="high" if item.pop >= 0.8 else "medium",
                        detail=f"{int(item.pop * 100)}% precip chance",
                    )
                )
            if item.wind_speed >= 12:
                events.append(
                    InsightTimelineEvent(
                        timestamp=item.forecast_timestamp,
                        title="Wind surge",
                        severity="high" if item.wind_speed >= 16 else "medium",
                        detail=f"{item.wind_speed:.1f} m/s gust potential",
                    )
                )
            if lower_main in {"thunderstorm", "tornado", "squall"}:
                events.append(
                    InsightTimelineEvent(
                        timestamp=item.forecast_timestamp,
                        title="Severe convection",
                        severity="high",
                        detail=item.weather_description,
                    )
                )

        return sorted(events, key=lambda e: e.timestamp)[:6]

    def _build_alerts(
        self,
        current: Optional[WeatherSnapshot],
        forecast: List[ForecastItem],
    ) -> List[str]:
        alerts: List[str] = []
        if current and current.visibility is not None and current.visibility < 2500:
            alerts.append("Reduced visibility now. Drive with caution.")
        if current and current.wind_speed >= 14:
            alerts.append("Strong winds in effect. Secure loose outdoor items.")

        rain_spikes = [item for item in forecast[:8] if item.pop >= 0.7]
        if rain_spikes:
            alerts.append("Heavy rain risk in the next 24 hours.")

        severe_items = [
            item for item in forecast[:12]
            if item.weather_main.lower() in {"thunderstorm", "tornado", "squall"}
        ]
        if severe_items:
            alerts.append("Potential severe storm cells detected in forecast window.")

        return alerts[:4]

    def _build_change_summary(
        self,
        previous_current: Optional[WeatherSnapshot],
        current: Optional[WeatherSnapshot],
        forecast: List[ForecastItem],
    ) -> Optional[ForecastChangeSummary]:
        if not current:
            return None

        prev_temp = previous_current.temperature if previous_current else current.temperature
        prev_wind = previous_current.wind_speed if previous_current else current.wind_speed
        prev_rain = 0.0
        if previous_current and previous_current.weather_main.lower() in {"rain", "drizzle", "thunderstorm"}:
            prev_rain = 0.4

        next_rain = max((item.pop for item in forecast[:8]), default=0.0)
        temperature_delta = round(current.temperature - prev_temp, 1)
        rain_delta = round((next_rain - prev_rain) * 100, 1)
        wind_delta = round(current.wind_speed - prev_wind, 1)

        parts: List[str] = []
        if abs(temperature_delta) >= 1:
            parts.append(
                f"Temp {'up' if temperature_delta > 0 else 'down'} {abs(temperature_delta):.1f} deg"
            )
        if abs(rain_delta) >= 10:
            parts.append(
                f"rain risk {'up' if rain_delta > 0 else 'down'} {abs(rain_delta):.0f}%"
            )
        if abs(wind_delta) >= 1:
            parts.append(
                f"wind {'up' if wind_delta > 0 else 'down'} {abs(wind_delta):.1f} m/s"
            )

        headline = ", ".join(parts) if parts else "No major change since last sync."
        return ForecastChangeSummary(
            headline=headline,
            temperature_delta=temperature_delta,
            rain_delta=rain_delta,
            wind_delta=wind_delta,
        )

    def _build_briefing(
        self,
        current: Optional[WeatherSnapshot],
        forecast: List[ForecastItem],
        alerts: List[str],
        impacts: DailyImpactScores,
    ) -> str:
        if not current:
            return "Sync weather to generate a personalized briefing."

        condition = current.weather_description or current.weather_main
        rain_peak = max((item.pop for item in forecast[:8]), default=0.0)
        summary = (
            f"Now {current.temperature:.1f} deg with {condition}. "
            f"Peak rain chance next 24h is {int(rain_peak * 100)}%. "
            f"Outdoor score {impacts.outdoor}/100."
        )
        if alerts:
            summary += f" Priority alert: {alerts[0]}"
        return summary
