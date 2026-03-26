import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

export function Login({ setCurrentPage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');   // inline error message
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    // Basic field validation
    if (!email.trim() || !password.trim()) {
      setError('Please fill in both fields.');
      return;
    }

    setLoading(true);
    try {
      // POST to the real backend auth route
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (data.success) {
        // Optionally store the username for display in the app
        if (rememberMe) {
          localStorage.setItem('rset_user', JSON.stringify(data.user));
        } else {
          sessionStorage.setItem('rset_user', JSON.stringify(data.user));
        }
        setCurrentPage('home');
      } else {
        // Show server-provided error message inline
        setError(data.message || 'Login failed. Please try again.');
      }
    } catch (err) {
      setError('Cannot connect to server. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            {/* Rajagiri logo – same asset as the Header */}
            <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
              <img
                src="/rajagiri-logo.png"
                alt="Rajagiri Logo"
                className="w-16 h-16 rounded-full object-cover"
              />
            </div>
          </div>
          <h2 className="text-white mb-2">Welcome Back</h2>
          <p className="text-white/80">Sign in to access RSET Weather Station</p>
        </div>

        {/* Login Form */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/10">
          <form onSubmit={handleLogin} className="space-y-6">

            {/* Inline error banner */}
            {error && (
              <div className="bg-red-500/20 border border-red-400/40 text-red-200 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-white mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/60" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@rset.edu.in"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-white mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/60" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-11 pr-12 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-white/30 bg-white/10 text-blue-600 focus:ring-2 focus:ring-white/50"
                />
                <span className="text-white/90 text-sm">Remember me</span>
              </label>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-blue-700 py-3 rounded-lg hover:bg-blue-50 transition-colors shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Sign Up Link */}
          <div className="mt-6 text-center">
            <p className="text-white/80">
              Don't have an account?{' '}
              <button onClick={() => setCurrentPage('signup')} className="text-white hover:underline">
                Sign Up
              </button>
            </p>
          </div>

          {/* Divider */}
          <div className="mt-6 flex items-center gap-4">
            <div className="flex-1 border-t border-white/20"></div>
            <span className="text-white/60 text-sm">OR</span>
            <div className="flex-1 border-t border-white/20"></div>
          </div>

          {/* Guest Access */}
          <button
            onClick={() => setCurrentPage('home')}
            className="w-full mt-4 bg-white/10 text-white py-3 rounded-lg hover:bg-white/20 transition-colors border border-white/20"
          >
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
