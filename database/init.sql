-- Weather Data Integration Platform - Database Schema
-- SQLite Database Initialization Script

-- Locations Table: Stores cities the user wants to track
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    is_favorite BOOLEAN DEFAULT 0,
    display_name VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, country)
);

-- Weather Snapshots Table: Historical weather data fetched from the API
CREATE TABLE IF NOT EXISTS weather_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    temperature REAL NOT NULL,
    feels_like REAL NOT NULL,
    temp_min REAL NOT NULL,
    temp_max REAL NOT NULL,
    pressure INTEGER NOT NULL,
    humidity INTEGER NOT NULL,
    weather_main VARCHAR(50) NOT NULL,
    weather_description VARCHAR(100) NOT NULL,
    weather_icon VARCHAR(10) NOT NULL,
    wind_speed REAL NOT NULL,
    wind_deg INTEGER,
    clouds INTEGER NOT NULL,
    visibility INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    api_timestamp INTEGER NOT NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

-- Forecast Data Table: 5-day forecast data
CREATE TABLE IF NOT EXISTS forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    forecast_timestamp INTEGER NOT NULL,
    temperature REAL NOT NULL,
    feels_like REAL NOT NULL,
    temp_min REAL NOT NULL,
    temp_max REAL NOT NULL,
    pressure INTEGER NOT NULL,
    humidity INTEGER NOT NULL,
    weather_main VARCHAR(50) NOT NULL,
    weather_description VARCHAR(100) NOT NULL,
    weather_icon VARCHAR(10) NOT NULL,
    wind_speed REAL NOT NULL,
    wind_deg INTEGER,
    clouds INTEGER NOT NULL,
    pop REAL NOT NULL,  -- Probability of precipitation
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

-- User Preferences Table: Application settings
CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key VARCHAR(50) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sync History Table: Track when data was last synced
CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    sync_type VARCHAR(20) NOT NULL,  -- 'current' or 'forecast'
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL,  -- 'success' or 'failed'
    error_message TEXT,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_weather_snapshots_location_id ON weather_snapshots(location_id);
CREATE INDEX IF NOT EXISTS idx_weather_snapshots_timestamp ON weather_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_forecasts_location_id ON forecasts(location_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_timestamp ON forecasts(forecast_timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_history_location_id ON sync_history(location_id);

-- Insert default user preferences
INSERT OR IGNORE INTO user_preferences (key, value) VALUES ('units', 'metric');
INSERT OR IGNORE INTO user_preferences (key, value) VALUES ('refresh_interval', '600');
INSERT OR IGNORE INTO user_preferences (key, value) VALUES ('language', 'en');
