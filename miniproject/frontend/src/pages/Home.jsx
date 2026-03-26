import { MainWeatherCard } from '../components/MainWeatherCard';
import { HourlyForecast } from '../components/HourlyForecast';
import { WeatherChatbot } from '../components/WeatherChatbot';

export function Home({ setCurrentPage }) {
  return (
    <>
      <MainWeatherCard />
      <HourlyForecast />
      <WeatherChatbot setCurrentPage={setCurrentPage} />
    </>
  );
}
