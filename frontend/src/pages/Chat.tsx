import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Sparkles, Gift, FileText, Users, Zap, Brain } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type AIProvider = 'nvidia' | 'claude';

export function Home() {
  const navigate = useNavigate();
  const [prompt, setMessage] = useState('');
  const [provider, setProvider] = useState<AIProvider>('nvidia');
  
  const handleGenerate = () => {
    if (prompt.trim()) {
      console.log('Navigating to workspace with provider:', provider);
      navigate('/workspace', { state: { initialPrompt: prompt, provider } });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#181818] via-[#3843dc] via-[#7b82ea] to-[#ea8dcc] relative overflow-hidden" style={{
      background: 'radial-gradient(ellipse 160% 120% at top, #181919 0%, #181919 32%, #1e2961 45%, #4b75f4 58%, #7b82ea 68%, #ea8dcc 82%, #ff6b35 100%)'
    }}>
      {/* Grain texture overlay */}
      <div 
        className="absolute inset-0 opacity-60 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          mixBlendMode: 'multiply'
        }}
      />

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between" style={{ paddingTop: '10px', paddingBottom: '10px', paddingLeft: '30px', paddingRight: '30px' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-orange-500 rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-xl">SiteSmith</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-white/80">
          <a href="#" className="hover:text-white transition-colors">Community</a>
          <a href="#" className="hover:text-white transition-colors">Pricing</a>
          <a href="#" className="hover:text-white transition-colors">Enterprise</a>
          <a href="#" className="hover:text-white transition-colors">Learn</a>
          <a href="#" className="hover:text-white transition-colors">Launched</a>
        </div>

        <div className="flex items-center gap-4">
          <Gift className="w-5 h-5 text-white/80" />
          <FileText className="w-5 h-5 text-white/80" />
          <div className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">Dev's SiteSmith</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-120px)] px-6">
        <div className="mb-8">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-white/80 text-sm">
            Introducing SiteSmith ✨
          </div>
        </div> 

        {/* Hero Title */}
        <div className="text-center mb-8 max-w-5xl w-full px-4 pt-60">
          <h1 className="text-8xl md:text-4xl font-bold text-white mb-6" style={{ fontFamily: 'Cooper Hewitt, sans-serif' }}>
            Build something with{' '}
            <span className="inline-flex items-center gap-2">
              SiteSmith
            </span>
          </h1>
          <p className="text-lg text-white/70 font-light">
            Create apps and websites by chatting with AI
          </p>
        </div>  

        {/* Large Input Area */}
        <div className="w-full max-w-4xl px-4 pb-16">
          <div className="bg-[#262625] border border-gray-700/50 rounded-3xl p-6">
            <div className="flex flex-col gap-4">
              <textarea
                value={prompt}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask SiteSmith to create a web app that..."
                className="w-full bg-transparent text-white placeholder-gray-400 border-0 outline-none resize-none leading-relaxed min-h-[50px]"
                style={{ fontSize: '16px' }}
                rows={1}
              />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg text-white/70 text-sm hover:bg-gray-700/50 transition-colors">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Public
                  </button>
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg text-white/70 text-sm hover:bg-gray-700/50 transition-colors">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Supabase
                  </button>
                  
                  {/* AI Provider Dropdown */}
                  <Select value={provider} onValueChange={(value) => setProvider(value as AIProvider)}>
                    <SelectTrigger className="w-[180px] bg-gray-800/50 border-gray-700/50 text-white/90 text-sm">
                      <SelectValue placeholder="Select AI Provider" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="nvidia" className="text-white/90 focus:bg-green-600/20 focus:text-white">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-green-500" />
                          <span>NVIDIA API</span>
                          <span className="text-xs bg-green-500/20 px-1.5 py-0.5 rounded ml-1">Free</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="claude" className="text-white/90 focus:bg-purple-600/20 focus:text-white">
                        <div className="flex items-center gap-2">
                          <Brain className="w-4 h-4 text-purple-500" />
                          <span>Claude API</span>
                          <span className="text-xs bg-purple-500/20 px-1.5 py-0.5 rounded ml-1">Pro</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim()}
                    title="Generate website"
                    aria-label="Generate website"
                    className="p-3 bg-white text-gray-900 rounded-xl hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Hint text */}
          <div className="text-center mt-4">
            <p className="text-white/50 text-sm">
              Press Enter to generate • Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
