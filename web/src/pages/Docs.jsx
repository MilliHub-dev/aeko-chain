import { useState } from 'react';
import { Menu, X, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import docsData from '../data/docs.json';

export default function Docs() {
  const [activeTab, setActiveTab] = useState("Introduction to AEKO Chain");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const sections = docsData.sections;
  const currentContent = docsData.content[activeTab];

  return (
    <div className="min-h-screen pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col lg:flex-row gap-12">
      
      {/* Mobile Menu Button */}
      <button 
        className="lg:hidden flex items-center gap-2 text-white bg-white/10 px-4 py-2 rounded-lg w-fit"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        <span>Menu</span>
      </button>

      {/* Sidebar Navigation */}
      <div className={`
        fixed inset-0 z-40 bg-aeko-dark lg:static lg:bg-transparent lg:block lg:w-64 lg:flex-shrink-0
        ${isMobileMenuOpen ? 'block p-6 overflow-y-auto' : 'hidden'}
      `}>
        <div className="sticky top-24 space-y-8">
          {isMobileMenuOpen && (
            <div className="flex justify-between items-center mb-6 lg:hidden">
              <span className="font-bold text-xl">Documentation</span>
              <button onClick={() => setIsMobileMenuOpen(false)}>
                <X size={24} />
              </button>
            </div>
          )}

          {sections.map((section, idx) => (
            <div key={idx}>
              <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                {section.title}
              </h3>
              <ul className="space-y-1 border-l border-white/10 ml-2">
                {section.items.map((item) => (
                  <li key={item}>
                    <button
                      onClick={() => {
                        setActiveTab(item);
                        setIsMobileMenuOpen(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`w-full text-left pl-4 py-2 text-sm transition-all duration-200 border-l -ml-px ${
                        activeTab === item 
                          ? 'text-aeko-accent border-aeko-accent font-medium bg-aeko-accent/5' 
                          : 'text-gray-400 border-transparent hover:text-white hover:border-white/30'
                      }`}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="prose prose-invert max-w-none"
        >
          {currentContent ? (
            <div dangerouslySetInnerHTML={{ __html: currentContent.html }} />
          ) : (
            <div className="space-y-6">
              <h1 className="text-4xl font-bold mb-6">{activeTab}</h1>
              <div className="p-8 bg-white/5 rounded-2xl border border-white/10 border-dashed text-center">
                <FileText className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">Documentation for this section is being updated.</p>
                <p className="text-sm text-gray-600 mt-2">Check back soon for detailed guides on {activeTab}.</p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Navigation Footer */}
        <div className="mt-16 pt-8 border-t border-white/10 flex justify-between">
          <button 
            className="text-sm text-gray-500 hover:text-white transition-colors"
            onClick={() => {
              // Logic to find prev tab could go here
            }}
          >
            {/* Previous link placeholder */}
          </button>
          
          <div className="flex gap-4">
             <a href="https://github.com/MilliHub-dev/aeko-chain" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-gray-400 hover:text-aeko-accent transition-colors">
               <span className="border-b border-dashed border-gray-600 hover:border-aeko-accent">Edit this page on GitHub</span>
             </a>
          </div>
        </div>
      </div>

    </div>
  );
}
