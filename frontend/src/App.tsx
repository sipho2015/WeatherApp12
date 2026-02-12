import { useState, useEffect } from 'react'
import { Plus, Search, RefreshCw, Star, Trash2, MapPin, Wind, Droplets, Thermometer, Calendar, Cloud, CloudRain, Sun, CloudSnow, CloudLightning, ChevronRight, Settings, Activity, Database } from 'lucide-react'
import { format } from 'date-fns'
import type { Location, WeatherData } from './types/weather'
import './index.css'

function App() {
    const [locations, setLocations] = useState<Location[]>([])
    const [selectedLocation, setSelectedLocation] = useState<WeatherData | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [syncing, setSyncing] = useState<number | null>(null)
    const [preferences, setPreferences] = useState<{ [key: string]: string }>({ units: 'metric' })
    const [showSettings, setShowSettings] = useState(false)

    useEffect(() => {
        fetchLocations()
        fetchPreferences()
    }, [])

    const fetchPreferences = async () => {
        try {
            const response = await fetch('/api/preferences')
            const data = await response.json()
            const prefs: { [key: string]: string } = {}
            data.forEach((p: any) => prefs[p.key] = p.value)
            setPreferences(prefs)
        } catch (error) {
            console.error('Failed to fetch preferences:', error)
        }
    }

    const handleUpdatePreference = async (key: string, value: string) => {
        try {
            await fetch(`/api/preferences/${key}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value })
            })
            setPreferences(prev => ({ ...prev, [key]: value }))
            if (selectedLocation) {
                handleViewWeather(selectedLocation.location)
            }
        } catch (error) {
            console.error('Failed to update preference:', error)
        }
    }

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
        if (!location?.id) return
        setLoading(true)
        try {
            const response = await fetch(`/api/locations/${location.id}/weather`)
            if (!response.ok) throw new Error('System node offline')
            const data = await response.json()
            setSelectedLocation(data)
        } catch (error) {
            console.error('Error fetching weather:', error)
            setSelectedLocation(null)
        } finally {
            setLoading(false)
        }
    }

    const handleSyncWeather = async (id: number) => {
        if (!id) return
        setSyncing(id)
        try {
            const response = await fetch(`/api/locations/${id}/sync`, { method: 'POST' })
            if (!response.ok) {
                const errData = await response.json()
                alert(`Sync failed: ${errData.detail || 'Internal error'}`)
                return
            }
            const data = await response.json()
            if (selectedLocation?.location?.id === id) {
                setSelectedLocation(data)
            }
            await fetchLocations()
        } catch (error) {
            console.error('Error syncing weather:', error)
        } finally {
            setSyncing(null)
        }
    }

    const getWeatherIcon = (condition: string) => {
        const cond = condition.toLowerCase();
        if (isActiveIcon(cond, 'cloud')) return <Cloud className="w-12 h-12" />;
        if (isActiveIcon(cond, 'rain')) return <CloudRain className="w-12 h-12" />;
        if (isActiveIcon(cond, 'clear') || isActiveIcon(cond, 'sun')) return <Sun className="w-12 h-12" />;
        if (isActiveIcon(cond, 'snow')) return <CloudSnow className="w-12 h-12" />;
        if (isActiveIcon(cond, 'storm') || isActiveIcon(cond, 'thunder')) return <CloudLightning className="w-12 h-12" />;
        if (isActiveIcon(cond, 'mist') || isActiveIcon(cond, 'fog')) return <Wind className="w-12 h-12" />;
        return <Cloud className="w-12 h-12" />;
    };

    const isActiveIcon = (cond: string, key: string) => cond.includes(key);

    const WorldMap = () => (
        <div className="card relative w-full overflow-hidden bg-black mb-12" style={{ height: '450px', borderStyle: 'solid', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div className="flex justify-between items-start p-6 border-b border-white/5 bg-zinc-900/20">
                <div>
                    <p className="text-[10px] text-white font-black tracking-[0.4em] uppercase">PlanetNexus / Geospatial Link</p>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></div>
                        <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Core Synchronized / WGS84</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[8px] text-zinc-600 font-mono uppercase tracking-[0.2em]">Orbital Refresh: 10hz</p>
                    <p className="text-[8px] text-zinc-700 font-mono uppercase mt-1">Frame: 00492-AX</p>
                </div>
            </div>

            <div className="relative flex-1 flex justify-center items-center">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_70%)]"></div>

                <div className="relative" style={{ width: '400px', height: '300px' }}>
                    <svg viewBox="0 0 1000 500" className="w-full h-full opacity-40 grayscale pointer-events-none">
                        <path d="M0 250 H 1000 M500 0 V 500" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                        <g fill="rgba(255,255,255,0.1)">
                            {[...Array(20)].map((_, i) =>
                                [...Array(10)].map((_, j) => (
                                    <circle key={`${i}-${j}`} cx={i * 50 + 25} cy={j * 50 + 25} r="0.5" />
                                ))
                            )}
                        </g>
                        <path
                            fill="none"
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth="1"
                            d="M150,200 L250,150 L400,180 L550,140 L700,200 L850,170 L950,220 M180,350 L350,380 L550,330 L800,350"
                        />
                    </svg>

                    {locations.map(loc => {
                        const x = ((loc.longitude + 180) / 360) * 1000;
                        const y = ((90 - loc.latitude) / 180) * 500;
                        const isActive = selectedLocation?.location?.id === loc.id;

                        return (
                            <div
                                key={loc.id}
                                className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300 group ${isActive ? 'z-20' : 'z-10'}`}
                                style={{ left: `${(x / 1000) * 100}%`, top: `${(y / 500) * 100}%` }}
                                onClick={() => handleViewWeather(loc)}
                            >
                                <div className={`w-2.5 h-2.5 rounded-full border-2 ${isActive ? 'bg-white border-white animate-pulse shadow-[0_0_10px_#fff]' : 'bg-transparent border-zinc-700 hover:border-zinc-400'}`}></div>

                                <div className={`absolute left-4 top-0 bg-black/95 border border-white/20 p-2.5 rounded-none backdrop-blur-xl transition-all duration-300 ${isActive ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0'}`} style={{ minWidth: '140px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-[10px] font-black uppercase text-white tracking-[0.2em]">{loc.display_name}</p>
                                        <span className="text-[8px] text-zinc-600 font-mono">0{loc.id}</span>
                                    </div>
                                    <div className="flex items-end gap-3">
                                        {isActive && selectedLocation?.current ? (
                                            <>
                                                <div className="text-2xl font-black text-white leading-none">
                                                    {Math.round(selectedLocation.current.temperature)}°
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] text-zinc-400 font-bold uppercase">{selectedLocation.current.weather_main}</span>
                                                    <span className="text-[7px] text-zinc-600 font-mono">LINK_READY</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-1 rounded-full bg-zinc-800"></div>
                                                <span className="text-[8px] text-zinc-600 font-bold uppercase">Ready</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="absolute bottom-6 left-6 flex flex-col gap-1 opacity-20 pointer-events-none">
                <div className="flex gap-4">
                    <div className="w-8 h-px bg-white"></div>
                    <div className="w-8 h-px bg-white"></div>
                </div>
                <div className="text-[6px] text-white font-mono">LON: 180.00 / LAT: 90.00</div>
            </div>
        </div>
    );

    return (
        <div className="container">
            <header className="flex justify-between items-end mb-16">
                <div>
                    <h1>WeatherDesk</h1>
                    <p className="subtitle">NYC Integration / Core System</p>
                </div>

                <div className="flex items-center gap-6">
                    <form onSubmit={handleAddLocation} className="search-container">
                        <input
                            type="text"
                            placeholder="Add station..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            disabled={loading}
                        />
                        <button type="submit" className="btn-primary" disabled={loading}>
                            Add Node
                        </button>
                    </form>

                    <div className="relative">
                        <button
                            className={`btn-icon ${showSettings ? 'bg-bg-tertiary' : ''}`}
                            onClick={() => setShowSettings(!showSettings)}
                        >
                            <Settings className="w-5 h-5" />
                        </button>

                        {showSettings && (
                            <div className="card absolute right-0 mt-2 w-48 z-50 shadow-lg" style={{ background: 'var(--bg-primary)' }}>
                                <p className="metric-label mb-2">SYSTEM PREFERENCES</p>
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-[10px] font-bold uppercase text-zinc-500">Units</span>
                                        <select
                                            value={preferences.units}
                                            onChange={(e) => handleUpdatePreference('units', e.target.value)}
                                            className="bg-bg-secondary border-none text-[10px] uppercase p-1 outline-none"
                                        >
                                            <option value="metric">Metric (°C)</option>
                                            <option value="imperial">Imperial (°F)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <div className="grid-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 320px) 1fr', gap: '4rem', alignItems: 'start' }}>
                <aside className="sidebar group">
                    <div className="flex justify-between items-center px-2 mb-6">
                        <p className="metric-label">Node Registry</p>
                        <span className="text-[9px] text-zinc-500 font-mono uppercase">{locations.length} ACTIVE</span>
                    </div>

                    <div className="flex flex-col gap-1">
                        {locations.length === 0 && (
                            <div className="card text-center text-muted" style={{ borderStyle: 'dashed', padding: '3rem 1rem' }}>
                                <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                <p className="text-[10px] uppercase tracking-widest">No nodes found</p>
                            </div>
                        )}
                        {locations.map((loc) => (
                            <div
                                key={loc.id}
                                className={`location-item group/item ${selectedLocation?.location?.id === loc.id ? 'active' : ''}`}
                                onClick={() => handleViewWeather(loc)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-zinc-100 dark:bg-zinc-900 border border-border-primary rounded-sm">
                                        <MapPin className="w-4 h-4" />
                                    </div>
                                    <div className="overflow-hidden">
                                        <h3 className="font-bold uppercase truncate" style={{ fontSize: '0.8rem', letterSpacing: '0.05em' }}>{loc.display_name}</h3>
                                        <p className="text-[9px] text-zinc-500 font-mono">{loc.latitude.toFixed(2)}N / {loc.longitude.toFixed(2)}E</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 items-center opacity-0 group-hover/item:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        className="btn-icon p-1"
                                        onClick={() => handleToggleFavorite(loc)}
                                        title={loc.is_favorite ? 'Remove' : 'Favorite'}
                                    >
                                        <Star className={`w-3.5 h-3.5 ${loc.is_favorite ? 'fill-black dark:fill-white' : 'text-zinc-400'}`} />
                                    </button>
                                    <button
                                        className="btn-icon p-1"
                                        onClick={() => handleDeleteLocation(loc.id)}
                                    >
                                        <Trash2 className="w-3.5 h-3.5 text-zinc-400 hover:text-red-500" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                <main className="flex flex-col gap-8">
                    <section className="fade-in">
                        <WorldMap />
                    </section>

                    {!selectedLocation ? (
                        <div className="card flex items-center justify-center p-20 bg-zinc-50 dark:bg-zinc-900/10" style={{ borderStyle: 'dashed', minHeight: '400px' }}>
                            <div className="text-center">
                                <Activity className="w-12 h-12 mb-6 mx-auto text-zinc-300 dark:text-zinc-800 animate-pulse" />
                                <h3 className="text-zinc-500 uppercase tracking-[0.2em] font-bold text-sm">Awaiting Node Selection</h3>
                                <p className="text-zinc-400 text-[10px] mt-2 uppercase">Select a station to initialize link</p>
                            </div>
                        </div>
                    ) : (
                        <div className="fade-in">
                            <header className="flex justify-between items-end mb-12 border-b border-border-primary pb-8">
                                <div>
                                    <div className="flex items-center gap-4 mb-3">
                                        <span className="text-[10px] bg-black dark:bg-white text-white dark:text-black px-2 py-1 font-bold uppercase tracking-widest leading-none">Active Link</span>
                                        <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest px-2 border-l border-zinc-800">NODE_{selectedLocation.location.id}</span>
                                    </div>
                                    <h2 className="text-6xl font-black tracking-tighter uppercase">{selectedLocation.location.display_name}</h2>
                                    <p className="text-zinc-500 mt-2 text-[11px] font-mono tracking-widest">
                                        COORDS: {selectedLocation.location.latitude.toFixed(4)}, {selectedLocation.location.longitude.toFixed(4)}
                                        {selectedLocation.last_synced && (
                                            <span className="ml-4 border-l border-zinc-800 pl-4">L_SYNC: {format(new Date(selectedLocation.last_synced), 'HH:mm:ss')}</span>
                                        )}
                                    </p>
                                </div>
                                <button
                                    className="btn-primary flex items-center gap-2 group"
                                    onClick={() => handleSyncWeather(selectedLocation.location.id)}
                                    disabled={syncing !== null}
                                >
                                    <RefreshCw className={`w-4 h-4 ${syncing === selectedLocation.location.id ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                                    <span>{syncing === selectedLocation.location.id ? 'Syncing...' : 'Request Sync'}</span>
                                </button>
                            </header>

                            {!selectedLocation.current ? (
                                <div className="card text-center p-24 bg-zinc-50 dark:bg-zinc-900/40" style={{ borderStyle: 'dotted' }}>
                                    <p className="text-zinc-500 text-[10px] font-black tracking-[0.3em] mb-8 uppercase">Satellite Cache: Offline</p>
                                    <button className="btn-primary px-12" onClick={() => handleSyncWeather(selectedLocation.location.id)}>Initialize Satellite Link</button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-12">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                                        <div className="flex items-center gap-8 card p-8 bg-zinc-50 dark:bg-zinc-900/20">
                                            <div className="p-6 bg-white dark:bg-black border border-border-primary shadow-2xl">
                                                {getWeatherIcon(selectedLocation.current.weather_main)}
                                            </div>
                                            <div>
                                                <span className="text-8xl font-black tracking-tighter leading-none">
                                                    {Math.round(selectedLocation.current.temperature)}°
                                                </span>
                                                <p className="text-[10px] font-black text-zinc-400 tracking-[0.3em] uppercase mt-2">
                                                    SYSTEM: {preferences.units} / {selectedLocation.current.weather_main}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-6">
                                            <div className="border-l-4 border-black dark:border-white pl-6 py-2">
                                                <h3 className="text-4xl font-black uppercase tracking-tight">{selectedLocation.current.weather_main}</h3>
                                                <p className="text-zinc-500 uppercase tracking-widest text-xs font-bold mt-1">{selectedLocation.current.weather_description}</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                                                    <p className="metric-label">Visiblity</p>
                                                    <p className="font-bold">{(selectedLocation.current.visibility || 0) / 1000} KM</p>
                                                </div>
                                                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                                                    <p className="metric-label">Wind Logic</p>
                                                    <p className="font-bold">{selectedLocation.current.wind_speed} M/S</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="metric-item group hover:border-black dark:hover:border-white transition-colors">
                                            <span className="metric-label opacity-40 group-hover:opacity-100 transition-opacity">Feels Like</span>
                                            <span className="metric-value">{Math.round(selectedLocation.current.feels_like)}°</span>
                                        </div>
                                        <div className="metric-item group hover:border-black dark:hover:border-white transition-colors">
                                            <span className="metric-label opacity-40 group-hover:opacity-100 transition-opacity">Humidity</span>
                                            <span className="metric-value">{selectedLocation.current.humidity}%</span>
                                        </div>
                                        <div className="metric-item group hover:border-black dark:hover:border-white transition-colors">
                                            <span className="metric-label opacity-40 group-hover:opacity-100 transition-opacity">Pressure</span>
                                            <span className="metric-value font-mono text-base">{selectedLocation.current.pressure} hPa</span>
                                        </div>
                                        <div className="metric-item group hover:border-black dark:hover:border-white transition-colors">
                                            <span className="metric-label opacity-40 group-hover:opacity-100 transition-opacity">Clouds</span>
                                            <span className="metric-value">{selectedLocation.current.clouds}%</span>
                                        </div>
                                    </div>

                                    <section className="mt-8">
                                        <div className="flex items-center gap-4 mb-8">
                                            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-400">Meteorological Projection / 5-Day</p>
                                            <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-900/50"></div>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                                            {selectedLocation.forecast?.filter((_, i) => i % 8 === 0).map((item) => (
                                                <div key={item.forecast_timestamp} className="card p-6 flex flex-col items-center border-dashed hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-default">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-4">{format(new Date(item.forecast_timestamp * 1000), 'EEEE')}</p>
                                                    <div className="p-4 bg-zinc-100 dark:bg-zinc-950 rounded-full mb-4">
                                                        {getWeatherIcon(item.weather_main)}
                                                    </div>
                                                    <p className="text-3xl font-black">{Math.round(item.temperature)}°</p>
                                                    <p className="text-[9px] text-zinc-500 font-bold uppercase mt-1 tracking-widest">{item.weather_main}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}

export default App
