import { Search } from 'lucide-react';



export function SearchBar({ searchQuery, setSearchQuery }) {
  return (
    <div className="max-w-md mx-auto mb-12">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input
          type="text"
          placeholder="Search location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-full bg-white/90 backdrop-blur-sm text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white shadow-lg"
        />
      </div>
    </div>
  );
}
