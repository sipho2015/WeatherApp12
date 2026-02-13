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

export interface WeatherData {
    location: Location;
    current: WeatherSnapshot | null;
    forecast: ForecastItem[] | null;
    last_synced: string | null;
}
