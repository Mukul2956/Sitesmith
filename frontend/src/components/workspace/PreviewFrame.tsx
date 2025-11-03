import { WebContainer } from '@webcontainer/api';
import { useEffect, useState } from 'react';

interface PreviewFrameProps {
  webContainer: WebContainer;
}

interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

export function PreviewFrame({ webContainer }: PreviewFrameProps) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [previews, setPreviews] = useState<PreviewInfo[]>([]);

  async function main() {
    try {
      setIsLoading(true);
      setError(null);
      setLogs([]);
      setPreviews([]);
      
      // Set up port listener first (based on bolt.new approach)
      const handlePortEvent = (port: number, type: 'open' | 'close', url: string) => {
        console.log(`Port event: ${type} on port ${port}, URL: ${url}`);
        setLogs(prev => [...prev, `Port ${port}: ${type} - ${url}`]);
        
        setPreviews(currentPreviews => {
          const existingIndex = currentPreviews.findIndex(p => p.port === port);
          
          if (type === 'close') {
            if (existingIndex !== -1) {
              return currentPreviews.filter(p => p.port !== port);
            }
            return currentPreviews;
          }
          
          const previewInfo: PreviewInfo = {
            port,
            ready: type === 'open',
            baseUrl: url
          };
          
          if (existingIndex !== -1) {
            const updated = [...currentPreviews];
            updated[existingIndex] = previewInfo;
            return updated;
          } else {
            return [...currentPreviews, previewInfo];
          }
        });
        
        // Set the URL for the first preview that becomes ready
        if (type === 'open') {
          setUrl(url);
          setIsLoading(false);
          setLogs(prev => [...prev, `Preview ready at ${url}`]);
        }
      };

      // Listen for port events
      webContainer.on('port', handlePortEvent);
      
      console.log('Starting npm install...');
      setLogs(prev => [...prev, 'Installing dependencies...']);
      
      // Check which package.json we're using
      try {
        const packageJsonContent = await webContainer.fs.readFile('package.json', 'utf8');
        console.log('📋 Using package.json:', packageJsonContent.substring(0, 200) + '...');
        const packageData = JSON.parse(packageJsonContent);
        console.log('📋 Available scripts:', Object.keys(packageData.scripts || {}));
        
        if (!packageData.scripts?.dev) {
          console.warn('⚠️ No "dev" script found in package.json. Available scripts:', Object.keys(packageData.scripts || {}));
          setError('No "dev" script found in package.json');
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.error('❌ Could not read package.json:', err);
        setError('Could not read package.json');
        setIsLoading(false);
        return;
      }
      
      const installProcess = await webContainer.spawn('npm', ['install']);

      installProcess.output.pipeTo(new WritableStream({
        write(data) {
          console.log('Install output:', data);
        }
      }));

      // Wait for install to complete
      const installExitCode = await installProcess.exit;
      
      if (installExitCode !== 0) {
        throw new Error(`npm install failed with exit code ${installExitCode}`);
      }
      
      setLogs(prev => [...prev, 'Dependencies installed successfully']);
      console.log('Starting dev server...');
      setLogs(prev => [...prev, 'Starting development server...']);
      
      // Start the dev server (don't await it as it runs continuously)
      const devProcess = await webContainer.spawn('npm', ['run', 'dev']);
      
      // Listen for server output
      devProcess.output.pipeTo(new WritableStream({
        write(data) {
          console.log('Dev server output:', data);
        }
      }));

      // The port listener will handle setting the URL when the server is ready
      setLogs(prev => [...prev, 'Development server starting...']);
      
      // Set a generous timeout in case the server doesn't start (120s)
      setTimeout(() => {
        if (!url && previews.length === 0) {
          setError('Server failed to start within 120 seconds');
          setIsLoading(false);
        }
      }, 120000);
      
    } catch (err) {
      console.error('Preview error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start preview');
      setIsLoading(false);
      setLogs(prev => [...prev, `Error: ${err instanceof Error ? err.message : 'Unknown error'}`]);
    }
  }

  // Update URL when previews change
  useEffect(() => {
    if (previews.length > 0 && !url) {
      // Find the first ready preview or just the first one
      const readyPreview = previews.find(p => p.ready) || previews[0];
      if (readyPreview && readyPreview.baseUrl) {
        setUrl(readyPreview.baseUrl);
        setIsLoading(false);
        setLogs(prev => [...prev, `Preview ready at ${readyPreview.baseUrl}`]);
      }
    }
  }, [previews, url]);

  useEffect(() => {
    if (webContainer) {
      main();
    }
  }, [webContainer]);

  return (
    <div className="h-full flex flex-col">
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="mb-2">Starting preview server...</p>
            {logs.length > 0 && (
              <div className="text-xs max-w-md">
                <div className="bg-black/20 rounded p-2 max-h-32 overflow-y-auto">
                  {logs.slice(-5).map((log, i) => (
                    <div key={i} className="text-left">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-red-400">
            <p className="mb-2">Preview Error:</p>
            <p className="text-sm mb-4">{error}</p>
            <button 
              onClick={main}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
            {logs.length > 0 && (
              <div className="mt-4 text-xs max-w-md mx-auto">
                <div className="bg-black/20 rounded p-2 max-h-32 overflow-y-auto">
                  {logs.map((log, i) => (
                    <div key={i} className="text-left text-gray-300">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {url && !isLoading && !error && (
        <div className="flex-1 flex flex-col">
          {/* Preview URL removed from UI - available in console logs */}
          <iframe 
            width="100%" 
            height="100%" 
            src={url} 
            title="Live Preview"
            className="border-0 flex-1"
            onLoad={() => console.log('Preview iframe loaded')}
            onError={(e) => console.error('Preview iframe error:', e)}
          />
        </div>
      )}
    </div>
  );
}
