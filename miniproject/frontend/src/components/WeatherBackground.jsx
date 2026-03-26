import React, { useState, useEffect, useMemo } from 'react';
import './WeatherBackground.css';

/**
 * Determines the weather condition from raw sensor data.
 * Returns one of: 'sunny', 'partly-cloudy', 'cloudy', 'rainy', 'night-clear', 'night-rainy'
 */
function classifyWeather(data) {
    if (!data) return 'partly-cloudy';

    const solarRad = data.solarradiation ?? 0;
    const rain = data.dailyrainin ?? 0;
    const hourlyRain = data.hourlyrainin ?? 0;
    const uv = data.uv ?? 0;

    // Determine if it's nighttime (solar radiation near zero and UV is 0)
    const isNight = solarRad < 5 && uv === 0;
    const isRaining = rain > 0 || hourlyRain > 0;

    if (isNight && isRaining) return 'night-rainy';
    if (isNight) return 'night-clear';
    if (isRaining) return 'rainy';
    if (solarRad > 200) return 'sunny';
    if (solarRad > 50) return 'partly-cloudy';
    return 'cloudy';
}

/**
 * Generate an array of raindrop configs once
 */
function generateRaindrops(count = 80) {
    return Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        duration: `${0.5 + Math.random() * 0.7}s`,
        delay: `${Math.random() * 2}s`,
        height: `${10 + Math.random() * 15}px`,
        opacity: 0.3 + Math.random() * 0.5,
    }));
}

/**
 * Generate star configs
 */
function generateStars(count = 60) {
    return Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 70}%`,
        duration: `${2 + Math.random() * 4}s`,
        delay: `${Math.random() * 3}s`,
        large: Math.random() > 0.8,
    }));
}

/**
 * Generate cloud configs
 */
function generateClouds(count = 5) {
    return Array.from({ length: count }, (_, i) => ({
        id: i,
        top: `${5 + Math.random() * 30}%`,
        width: `${120 + Math.random() * 180}px`,
        height: `${30 + Math.random() * 30}px`,
        duration: `${40 + Math.random() * 40}s`,
        delay: `${-Math.random() * 40}s`,
        opacity: 0.04 + Math.random() * 0.08,
    }));
}

export function WeatherBackground() {
    const [condition, setCondition] = useState('partly-cloudy');

    // Pre-generate particles (stable across re-renders)
    const raindrops = useMemo(() => generateRaindrops(), []);
    const stars = useMemo(() => generateStars(), []);
    const clouds = useMemo(() => generateClouds(), []);

    useEffect(() => {
        let mounted = true;

        // DEV: Allow URL override for previewing, e.g. ?weather=rainy
        const params = new URLSearchParams(window.location.search);
        const override = params.get('weather');
        if (override) {
            setCondition(override);
            return;
        }

        async function fetchCondition() {
            try {
                const res = await fetch('http://localhost:3000/api/weather');
                const data = await res.json();
                if (mounted && data && data.length > 0) {
                    const lastData = data[0].lastData || {};
                    setCondition(classifyWeather(lastData));
                }
            } catch {
                // Silently fail — keep existing condition
            }
        }

        fetchCondition();
        const interval = setInterval(fetchCondition, 60000); // Refresh every minute

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    const isNight = condition.startsWith('night');
    const isRainy = condition.includes('rainy') || condition === 'rainy';
    const isSunny = condition === 'sunny';
    const isCloudy = condition === 'cloudy' || condition === 'partly-cloudy';

    return (
        <div className={`weather-bg ${condition}`}>
            {/* Sun for sunny conditions */}
            {isSunny && (
                <div className="sun-container">
                    <div className="sun-glow" />
                    <div className="sun-core" />
                    {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} className="sun-ray" />
                    ))}
                </div>
            )}

            {/* Moon and Stars for night */}
            {isNight && (
                <>
                    <div className="moon-container">
                        <div className="moon">
                            <div className="moon-crater" />
                            <div className="moon-crater" />
                            <div className="moon-crater" />
                        </div>
                    </div>
                    <div className="stars-container">
                        {stars.map(star => (
                            <div
                                key={star.id}
                                className={`star ${star.large ? 'large' : ''}`}
                                style={{
                                    left: star.left,
                                    top: star.top,
                                    animationDuration: star.duration,
                                    animationDelay: star.delay,
                                }}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* Rain for rainy conditions */}
            {isRainy && (
                <div className="rain-container">
                    {raindrops.map(drop => (
                        <div
                            key={drop.id}
                            className="raindrop"
                            style={{
                                left: drop.left,
                                animationDuration: drop.duration,
                                animationDelay: drop.delay,
                                height: drop.height,
                                opacity: drop.opacity,
                            }}
                        />
                    ))}
                    <div className="lightning-container">
                        <div className="lightning-flash" />
                    </div>
                </div>
            )}

            {/* Clouds for cloudy/partly-cloudy */}
            {(isCloudy || isRainy) && (
                <div className="cloud-container">
                    {clouds.map(cloud => (
                        <div
                            key={cloud.id}
                            className="cloud"
                            style={{
                                top: cloud.top,
                                width: cloud.width,
                                height: cloud.height,
                                animationDuration: cloud.duration,
                                animationDelay: cloud.delay,
                                opacity: cloud.opacity,
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
