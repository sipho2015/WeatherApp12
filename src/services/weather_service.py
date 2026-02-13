from typing import List, Optional, Tuple
from datetime import datetime
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
)
from src.api.weather_client import WeatherAPIClient

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
            return Location(**dict(row))

        # 3. Store new location
        query = """
            INSERT INTO locations (name, country, latitude, longitude, display_name)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *
        """
        cursor = self.db.execute(query, (name, country, lat, lon, name))
        row = cursor.fetchone()
        self.db.commit()
        return Location(**dict(row))

    async def search_locations(self, query: str, country: Optional[str] = None) -> List[LocationSearchResult]:
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

    async def sync_weather(self, location_id: int) -> Tuple[WeatherSnapshot, List[ForecastItem]]:
        location = self.get_location(location_id)
        if not location:
            raise ValueError("Location not found")
        
        # Get units preference
        cursor = self.db.execute("SELECT value FROM user_preferences WHERE key = 'units'")
        row = cursor.fetchone()
        # row may be a dict-like object; guard against missing 'value' key
        units = "metric"
        if row:
            try:
                units = row["value"]
            except Exception:
                # fallback to default if structure is unexpected
                units = str(row) if isinstance(row, str) else units
        
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
