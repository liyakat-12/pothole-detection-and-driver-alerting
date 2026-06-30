import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Navbar({ activeSection, setActiveSection }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const navItems = [
    { id: '/home', label: 'Home' },
    { id: '/map', label: 'Map' },
    { id: '/dashboard', label: 'Dashboard' },
    { id: '/report', label: 'Report Pothole' },
    { id: '/live', label: 'Live Detection' },
  ];

  return (
    <nav className="bg-[#11150f]/85 border-b border-neutral-800/80 sticky top-0 z-50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <button onClick={() => { setActiveSection('/home'); navigate('/home'); }} className="flex items-center space-x-3 group">
            <div className="w-10 h-10 bg-linear-to-br from-[#628141] to-[#8bae66] rounded-xl flex items-center justify-center font-bold text-white text-lg shadow-lg shadow-[#628141]/20 ring-1 ring-white/10 group-hover:scale-105 transition-transform">
              PH
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Pothole<span className="text-[#8bae66]">Detect</span></span>
          </button>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveSection(item.id); navigate(item.id); }}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeSection === item.id
                    ? 'bg-[#628141] text-white shadow-lg shadow-[#628141]/20'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-neutral-800">
            <div className="flex flex-col space-y-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileMenuOpen(false);
                    navigate(item.id);
                  }}
                  className={`px-4 py-3 rounded-lg text-sm font-medium text-left transition-all ${
                    activeSection === item.id
                      ? 'bg-[#628141] text-white'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}