import { Activity, Shield } from 'lucide-react';

const Navbar = () => {
  return (
    <nav className="bg-white shadow-md px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Activity className="h-8 w-8 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">
            DR Detection System
          </h1>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Shield className="h-4 w-4" />
          <span>Professional Medical AI</span>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;