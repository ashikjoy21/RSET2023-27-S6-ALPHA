import { useState } from 'react';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { Forecast } from './pages/Forecast';
import { History } from './pages/History ';
import { Analysis } from './pages/Analysis';
import { Alert } from './pages/Alert';
import { About } from './pages/About';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { WeatherBackground } from './components/WeatherBackground';
import './styles/globals.css';

function App() {
  const [currentPage, setCurrentPage] = useState('home');

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home setCurrentPage={setCurrentPage} />;
      case 'forecast':
        return <Forecast />;
      case 'history':
        return <History />;
      case 'analysis':
        return <Analysis />;
      case 'alert':
        return <Alert />;
      case 'about':
        return <About />;
      case 'login':
        return <Login setCurrentPage={setCurrentPage} />;
      case 'signup':
        return <SignUp setCurrentPage={setCurrentPage} />;
      default:
        return <Home setCurrentPage={setCurrentPage} />;
    }
  };

  return (
    <>
      <WeatherBackground />
      <div className="min-h-screen weather-app-content">
        <div className="container mx-auto px-4 py-6">
          <Header currentPage={currentPage} setCurrentPage={setCurrentPage} />
          <main>
            {renderPage()}
          </main>
        </div>
      </div>
    </>
  );
}

export default App;
