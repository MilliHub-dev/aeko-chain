import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Github, Twitter, ExternalLink, Activity } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '../assets/icon.jpg';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const links = [
    { name: 'Home', path: '/' },
    { name: 'Docs', path: '/docs' },
    { name: 'Token', path: '/token' },
    { name: 'Developers', path: '/developers' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <nav className="fixed top-4 inset-x-4 md:top-6 md:inset-x-0 md:max-w-5xl md:mx-auto z-50">
      <div className="bg-aeko-dark/70 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-full shadow-2xl shadow-black/50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-aeko-accent/20 blur-md rounded-full group-hover:bg-aeko-accent/40 transition-all duration-300" />
                <img src={logo} alt="AEKO Logo" className="relative w-9 h-9 rounded-xl border border-white/10" />
              </div>
              <span className="font-bold text-lg tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 group-hover:from-white group-hover:to-white transition-all duration-300">
                AEKO CHAIN
              </span>
            </Link>

            {/* Desktop Menu */}
            <div className="hidden md:block">
              <div className="flex items-center space-x-2">
                {links.map((link) => {
                  const isActive = location.pathname === link.path;
                  return (
                    <Link
                      key={link.name}
                      to={link.path}
                      className={`relative px-4 py-2 text-sm font-medium transition-all duration-300 rounded-full hover:text-white ${
                        isActive ? 'text-white' : 'text-gray-400'
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="navbar-indicator"
                          className="absolute inset-0 bg-white/10 rounded-full"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <span className="relative z-10">{link.name}</span>
                    </Link>
                  );
                })}
                <div className="w-px h-6 bg-white/10 mx-2" />
                <Link
                  to="/explorer"
                  className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all duration-300 group relative"
                >
                  <Activity size={20} />
                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Aeko Scan
                  </span>
                </Link>
                <a
                  href="https://github.com/MilliHub-dev/aeko-chain"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all duration-300"
                >
                  <Github size={20} />
                </a>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-gray-300 hover:text-white p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-white/10 overflow-hidden"
            >
              <div className="px-4 pt-2 pb-4 space-y-1">
                {links.map((link) => (
                  <Link
                    key={link.name}
                    to={link.path}
                    onClick={() => setIsOpen(false)}
                    className={`block px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                      location.pathname === link.path
                        ? 'bg-aeko-accent/10 text-aeko-accent'
                        : 'text-gray-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};

const Footer = () => {
  return (
    <footer className="bg-aeko-light border-t border-white/10 py-12 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <img src={logo} alt="AEKO Logo" className="w-8 h-8 rounded-lg" />
              <span className="font-bold text-lg">AEKO CHAIN</span>
            </div>
            <p className="text-gray-400 max-w-sm">
              The first Layer-1 blockchain built for the SocialFi era. 
              Featuring a native Permission Layer and High-Performance SVM Runtime.
            </p>
          </div>
          
          <div>
            <h3 className="font-bold mb-4">Ecosystem</h3>
            <ul className="space-y-2 text-gray-400">
              <li><Link to="/token" className="hover:text-aeko-accent">Tokenomics</Link></li>
              <li><Link to="/developers" className="hover:text-aeko-accent">Build on Aeko</Link></li>
              <li><Link to="/explorer" className="hover:text-aeko-accent">Explorer/Aeko Scan</Link></li>
              <li><a href="#" className="hover:text-aeko-accent">Bridge</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold mb-4">Community</h3>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-white"><Twitter /></a>
              <a href="#" className="text-gray-400 hover:text-white"><Github /></a>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-white/10 text-center text-gray-500 text-sm">
          © {new Date().getFullYear()} Aeko Chain Foundation. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-aeko-dark text-white font-sans selection:bg-aeko-accent selection:text-black">
      <Navbar />
      <main className="flex-grow pt-16">
        {children}
      </main>
      <Footer />
    </div>
  );
}
