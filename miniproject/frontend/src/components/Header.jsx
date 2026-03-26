import { LogIn } from 'lucide-react';



export function Header({ currentPage, setCurrentPage }) {
  const navItems = [
    { name: 'Home', id: 'home' },
    { name: 'Forecast', id: 'forecast' },
    { name: 'History', id: 'history' },
    { name: 'Analysis', id: 'analysis' },
    { name: 'Alert', id: 'alert' },
    { name: 'About', id: 'about' }
  ];

  return (
    <header className="flex items-center justify-between mb-8">
      <button onClick={() => setCurrentPage('home')} className="flex items-center gap-3">
        <img src="/rajagiri-logo.png" alt="Rajagiri Logo" className="w-9 h-9 rounded-full object-cover" />
        <h1 className="text-white tracking-wider uppercase">
          RSET Weather Station
        </h1>
      </button>
      <div className="flex items-center gap-6">
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`text-white transition-all ${currentPage === item.id
                ? 'border-b-2 border-white pb-1'
                : 'hover:border-b-2 hover:border-white pb-1 opacity-90'
                }`}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <button
          onClick={() => setCurrentPage('login')}
          className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg text-white hover:bg-white/30 transition-all"
        >
          <LogIn className="w-5 h-5" />
          <span>Login</span>
        </button>
      </div>
    </header>
  );
}