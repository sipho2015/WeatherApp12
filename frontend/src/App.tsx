import { useState, useEffect } from 'react'
import { Plus, Search, RefreshCw, Star, Trash2, MapPin, Wind, Droplets, Thermometer, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import type { Location, WeatherData } from './types/weather'
import './index.css'

function App() {
    const [locations, setLocations] = useState<Location[]>([])
    const [selectedLocation, setSelectedLocation] = useState<WeatherData | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [syncing, setSyncing] = useState<number | null>(null)

    useEffect(() => {
        fetchLocations()
    }, [])

    const fetchLocations = async () => {
        try {
            const response = await fetch('/api/locations')
            const data = await response.json()
            setLocations(data)
        } catch (error) {
            console.error('Failed to fetch locations:', error)
        }
    }

    const handleAddLocation = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!searchQuery) return

        setLoading(true)
        try {
            const response = await fetch('/api/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: searchQuery })
            })

            if (response.ok) {
                setSearchQuery('')
                await fetchLocations()
            } else {
                const err = await response.json()
                alert(err.detail || 'Failed to add location')
            }
        } catch (error) {
            console.error('Error adding location:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteLocation = async (id: number) => {
        if (!confirm('Are you sure you want to remove this location?')) return

        try {
            await fetch('/api/locations/' + id, { method: 'DELETE' })
            if (selectedLocation?.location.id === id) setSelectedLocation(null)
            await fetchLocations()
        } catch (error) {
            console.error('Error deleting location:', error)
        }
    }

    const handleToggleFavorite = async (location: Location) => {
        try {
            await fetch('/api/locations/' + location.id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_favorite: !location.is_favorite })
            })
            await fetchLocations()
        } catch (error) {
            console.error('Error updating favorite:', error)
        }
    }

    const handleViewWeather = async (location: Location) => {
        setLoading(true)
        try {
            const response = await fetch(`/api/locations/${location.id}/weather`)
            const data = await response.json()
            setSelectedLocation(data)
        } catch (error) {
            console.error('Error fetching weather:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSyncWeather = async (id: number) => {
        setSyncing(id)
        try {
            const response = await fetch(`/api/locations/${id}/sync`, { method: 'POST' })
            const data = await response.json()
            if (selectedLocation?.location.id === id) {
                setSelectedLocation(data)
            }
            await fetchLocations()
        } catch (error) {
            console.error('Error syncing weather:', error)
        } finally {
            setSyncing(null)
        }
    }

    const getWeatherIcon = (iconCode: string) => {
        return `https://openweathermap.org/img/wn/${iconCode}@4x.png`
    }

    return (
        <div className="container animate-fade-in">
            {/* Header */}
            <header className="flex justify-between items-center mb-12">
                <div>
                    <h1 className="text-4xl text-primary mb-2">WeatherDesk</h1>
                    <p className="text-muted">Premium Weather Integration Platform</p>
                </div>

                <form onSubmit={handleAddLocation} className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Add city (e.g. London)..."
                            className="pl-10 w-64"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            disabled={loading}
                        />
                    </div>
                    <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
                        <Plus className="w-5 h-5" />
                        Add City
                    </button>
                </form>
            </header>

            <div className="grid lg:grid-cols-12 gap-8">
                {/* Locations List */}
                <aside className="lg:col-span-4 flex flex-col gap-4">
                    <h2 className="text-xl px-2">Managed Locations</h2>
                    <div className="flex flex-col gap-3">
                        {locations.length === 0 && (
                            <div className="glass-card p-6 text-center text-muted">
                                No locations tracked yet. Add one above!
                            </div>
                        )}
                        {locations.map((loc) => (
                            <div
                                key={loc.id}
                                className={`glass-card p-4 flex justify-between items-center cursor-pointer ${selectedLocation?.location.id === loc.id ? 'border-primary bg-bg-secondary' : ''}`}
                                onClick={() => handleViewWeather(loc)}
                            >
                                <div className="flex items-center gap-3">
                                    <MapPin className={`w-5 h-5 ${loc.is_favorite ? 'text-warning' : 'text-muted'}`} />
                                    <div>
                                        <h3 className="font-semibold">{loc.display_name}</h3>
                                        <p className="text-sm text-muted">{loc.country}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        className={`btn-icon ${loc.is_favorite ? 'text-warning' : ''}`}
                                        onClick={() => handleToggleFavorite(loc)}
                                    >
                                        <Star className={`w-5 h-5 ${loc.is_favorite ? 'fill-warning' : ''}`} />
                                    </button>
                                    <button
                                        className="btn-icon text-muted hover:text-danger"
                                        onClick={() => handleDeleteLocation(loc.id)}
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Weather Dashboard */}
                <main className="lg:col-span-8">
                    {!selectedLocation ? (
                        <div className="glass-card h-[400px] flex flex-col items-center justify-center text-center p-8">
                            <div className="w-20 h-20 bg-bg-secondary rounded-full flex items-center justify-center mb-4">
                                <Calendar className="w-10 h-10 text-muted" />
                            </div>
                            <h2 className="text-2xl mb-2">Select a Location</h2>
                            <p className="text-muted max-w-sm">
                                Choose a city from the list to view real-time weather metrics and 5-day forecasts.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            {/* Current Weather Card */}
                            <div className="glass-card p-8">
                                <div className="flex justify-between items-start mb-8">
                                    <div>
                                        <h2 className="text-4xl font-bold mb-1">{selectedLocation.location.display_name}</h2>
                                        <p className="text-muted flex items-center gap-1">
                                            {selectedLocation.location.country} • {selectedLocation.last_synced ? `Last synced: ${format(new Date(selectedLocation.last_synced), 'HH:mm')}` : 'Never synced'}
                                        </p>
                                    </div>
                                    <button
                                        className={`btn-primary flex items-center gap-2 ${syncing === selectedLocation.location.id ? 'opacity-50' : ''}`}
                                        onClick={() => handleSyncWeather(selectedLocation.location.id)}
                                        disabled={syncing !== null}
                                    >
                                        <RefreshCw className={`w-4 h-4 ${syncing === selectedLocation.location.id ? 'animate-spin' : ''}`} />
                                        Sync Now
                                    </button>
                                </div>

                                {!selectedLocation.current ? (
                                    <div className="text-center p-12 bg-bg-primary/30 rounded-xl">
                                        <p className="text-muted mb-4">No data available yet. Please sync to fetch the latest weather.</p>
                                        <button className="btn-primary" onClick={() => handleSyncWeather(selectedLocation.location.id)}>Initialize Sync</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-8 mb-8">
                                            <div className="flex items-center">
                                                <img
                                                    src={getWeatherIcon(selectedLocation.current.weather_icon)}
                                                    alt={selectedLocation.current.weather_main}
                                                    className="w-32 h-32 -ml-4"
                                                />
                                                <div>
                                                    <span className="text-6xl font-bold">{Math.round(selectedLocation.current.temperature)}°C</span>
                                                    <p className="text-xl text-muted capitalize">{selectedLocation.current.weather_description}</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-x-12 gap-y-4 ml-auto">
                                                <div className="flex items-center gap-3">
                                                    <Thermometer className="w-5 h-5 text-primary" />
                                                    <div>
                                                        <p className="text-xs text-muted uppercase">Feels Like</p>
                                                        <p className="font-semibold">{Math.round(selectedLocation.current.feels_like)}°C</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Droplets className="w-5 h-5 text-primary" />
                                                    <div>
                                                        <p className="text-xs text-muted uppercase">Humidity</p>
                                                        <p className="font-semibold">{selectedLocation.current.humidity}%</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Wind className="w-5 h-5 text-primary" />
                                                    <div>
                                                        <p className="text-xs text-muted uppercase">Wind Speed</p>
                                                        <p className="font-semibold">{selectedLocation.current.wind_speed} m/s</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center text-[10px] font-bold text-primary">P</div>
                                                    <div>
                                                        <p className="text-xs text-muted uppercase">Pressure</p>
                                                        <p className="font-semibold">{selectedLocation.current.pressure} hPa</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Forecast Section */}
                                        <div className="border-t border-glass-border pt-8">
                                            <h3 className="text-lg mb-6 flex items-center gap-2">
                                                <Calendar className="w-5 h-5 text-primary" />
                                                5-Day Forecast
                                            </h3>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                                                {selectedLocation.forecast?.filter((_, i) => i % 8 === 0).map((item) => (
                                                    <div key={item.forecast_timestamp} className="bg-bg-primary/40 rounded-xl p-4 text-center border border-glass-border">
                                                        <p className="text-xs text-muted mb-1">{format(new Date(item.forecast_timestamp * 1000), 'EEE, MMM d')}</p>
                                                        <img src={getWeatherIcon(item.weather_icon)} alt={item.weather_main} className="w-12 h-12 mx-auto" />
                                                        <p className="font-bold">{Math.round(item.temperature)}°C</p>
                                                        <p className="text-[10px] text-muted capitalize truncate">{item.weather_description}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}

export default App
