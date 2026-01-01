import { Mail, MapPin, MessageSquare } from 'lucide-react';

export default function Contact() {
  return (
    <div className="pt-20 pb-32">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">Get in Touch</h1>
          <p className="text-xl text-gray-400">
            Have questions about the protocol? Want to partner? We'd love to hear from you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-aeko-light rounded-lg flex items-center justify-center text-aeko-accent flex-shrink-0">
                <Mail size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-1">Email Us</h3>
                <p className="text-gray-400 mb-2">For general inquiries and partnerships.</p>
                <a href="mailto:hello@aeko.chain" className="text-white hover:text-aeko-accent transition-colors">chain@aeko.social</a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-aeko-light rounded-lg flex items-center justify-center text-aeko-accent flex-shrink-0">
                <MessageSquare size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-1">Join the Community</h3>
                <p className="text-gray-400 mb-2">Chat with us and other developers on Discord.</p>
                <a href="#" className="text-white hover:text-aeko-accent transition-colors">discord.gg/aeko-chain</a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-aeko-light rounded-lg flex items-center justify-center text-aeko-accent flex-shrink-0">
                <MapPin size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-1">HQ</h3>
                <p className="text-gray-400">
                  Crypto Valley<br />
                  Zug, Switzerland
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
              <input 
                type="text" 
                className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-aeko-accent transition-colors"
                placeholder="Satoshi Nakamoto"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <input 
                type="email" 
                className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-aeko-accent transition-colors"
                placeholder="satoshi@bitcoin.org"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Message</label>
              <textarea 
                rows={4}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-aeko-accent transition-colors"
                placeholder="Tell us what you're building..."
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-aeko-accent text-black font-bold py-3 rounded-lg hover:bg-white transition-colors"
            >
              Send Message
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
