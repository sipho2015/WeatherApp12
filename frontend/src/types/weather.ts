export interface Location {
    id: number;
    name: string;
    country: string;
    latitude: number;
    longitude: number;
    display_name: string;
    is_favorite: boolean;
    created_at: string;
    updated_at: string;
}

export interface LocationSearchResult {
    name: string;
    country: string;
    state?: string;
    latitude: number;
    longitude: number;
    display_name: string;
}

export interface WeatherSnapshot {
    temperature: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    humidity: number;
    weather_main: string;
    weather_description: string;
    weather_icon: string;
    wind_speed: number;
    wind_deg: number;
    clouds: number;
    visibility: number;
    timestamp: string;
    api_timestamp: number;
}

export interface ForecastItem {
    forecast_timestamp: number;
    temperature: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    humidity: number;
    weather_main: string;
    weather_description: string;
    weather_icon: string;
    wind_speed: number;
    wind_deg: number;
    clouds: number;
    pop: number;
}

export interface ForecastConfidence {
    label: string;
    score: number;
    reason: string;
}

export interface DailyImpactScores {
    commute: number;
    outdoor: number;
    laundry: number;
    running: number;
}

export interface InsightTimelineEvent {
    timestamp: number;
    title: string;
    severity: string;
    detail: string;
}

export interface ForecastChangeSummary {
    headline: string;
    temperature_delta: number;
    rain_delta: number;
    wind_delta: number;
}

export interface WeatherInsights {
    briefing: string;
    confidence: ForecastConfidence[];
    impact_scores: DailyImpactScores;
    timeline: InsightTimelineEvent[];
    alerts: string[];
    change_summary: ForecastChangeSummary | null;
}

export interface WeatherData {
    location: Location;
    current: WeatherSnapshot | null;
    forecast: ForecastItem[] | null;
    last_synced: string | null;
    insights: WeatherInsights | null;
    sync_note?: string | null;
}

export interface LocationWeatherOverview {
    location: Location;
    current: WeatherSnapshot | null;
    last_synced: string | null;
}

export interface SystemStatus {
    total_locations: number;
    synced_locations: number;
    failed_sync_last_24h: number;
    last_success_sync: string | null;
    sync_interval_seconds: number;
    api_configured: boolean;
}
