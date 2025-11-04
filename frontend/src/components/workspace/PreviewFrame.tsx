import { WebContainer } from '@webcontainer/api';
import { useEffect, useState, useRef } from 'react';

interface PreviewFrameProps {
  webContainer: WebContainer;
}

interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

interface ProcessRef {
  name: string;
  process: any;
}

export function PreviewFrame({ webContainer }: PreviewFrameProps) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<PreviewInfo[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  
  // Process tracking for cleanup
  const runningProcesses = useRef<ProcessRef[]>([]);
  const startupTimeout = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function for all processes and listeners
  const cleanup = async () => {
    console.log('🧹 Cleaning up processes and listeners...');
    
    // Clear startup timeout
    if (startupTimeout.current) {
      clearTimeout(startupTimeout.current);
      startupTimeout.current = null;
    }
    
    // Clear process tracking (processes will be cleaned up by WebContainer)
    runningProcesses.current = [];
  };

  // Enhanced retry logic with exponential backoff
  const retryWithBackoff = async (attempt: number = 0) => {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    
    if (attempt >= maxRetries) {
      setError('Failed to start servers after multiple attempts. Please try again.');
      setIsLoading(false);
      return;
    }
    
    const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
    console.log(`🔄 Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    setRetryCount(attempt + 1);
    
    try {
      await cleanup(); // Clean up previous attempt
      await startServers(); // Try again
    } catch (err) {
      console.error(`❌ Retry attempt ${attempt + 1} failed:`, err);
      await retryWithBackoff(attempt + 1);
    }
  };

  async function startServers() {
    try {
      setIsLoading(true);
      setError(null);
      setPreviews([]);
      
      // Set startup timeout to prevent infinite loading
      startupTimeout.current = setTimeout(() => {
        console.warn('⏰ Server startup timeout reached');
        setError('Server startup timed out. Please try again.');
        setIsLoading(false);
      }, 120000); // 2 minutes timeout
      
      // Set up port listener first (based on bolt.new approach)
      const handlePortEvent = (port: number, type: 'open' | 'close', url: string) => {
        console.log(`Port event: ${type} on port ${port}, URL: ${url}`);
        
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
          
          // Clear timeout on successful start
          if (startupTimeout.current) {
            clearTimeout(startupTimeout.current);
            startupTimeout.current = null;
          }
        }
      };

      // Listen for port events
      webContainer.on('port', handlePortEvent);
      
      console.log('Starting npm install...');
      
      // Check for fullstack project structure and prioritize frontend for preview
      let workingDirectory = '.';
      let packageData: any = null;
      
      try {
        // Try different package.json locations for fullstack projects
        const packageJsonPaths = [
          { path: 'frontend/package.json', workingDir: 'frontend' },
          { path: 'package.json', workingDir: '.' },
          { path: 'backend/package.json', workingDir: 'backend' }
        ];
        
        for (const { path, workingDir } of packageJsonPaths) {
          try {
            const content = await webContainer.fs.readFile(path, 'utf8');
            const parsed = JSON.parse(content);
            
            // Prefer package.json with dev script for preview (usually frontend)
            if (parsed.scripts?.dev) {
              workingDirectory = workingDir;
              packageData = parsed;
              console.log(`📋 Using package.json at: ${path} with dev script`);
              console.log(`📁 Working directory: ${workingDirectory}`);
              console.log('📋 Available scripts:', Object.keys(parsed.scripts || {}));
              break;
            }
          } catch {
            // Continue trying other paths
          }
        }
        
        if (!packageData) {
          throw new Error('No package.json with dev script found');
        }
        
        if (!packageData.scripts?.dev) {
          console.warn('⚠️ No "dev" script found in package.json. Available scripts:', Object.keys(packageData.scripts || {}));
          setError('No "dev" script found in package.json');
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.error('❌ Could not find valid package.json:', err);
        setError('Could not find package.json with dev script');
        setIsLoading(false);
        return;
      }
      
      const installProcess = await webContainer.spawn('npm', ['install'], {
        cwd: workingDirectory
      });

      // Track install process
      runningProcesses.current.push({
        name: `npm-install-${workingDirectory}`,
        process: installProcess
      });

      installProcess.output.pipeTo(new WritableStream({
        write(data) {
          const output = String(data);
          console.log('Install output:', output);
        }
      }));

      // Wait for install to complete
      const installExitCode = await installProcess.exit;
      
      // Remove from tracking after completion
      runningProcesses.current = runningProcesses.current.filter(p => p.name !== `npm-install-${workingDirectory}`);
      
      if (installExitCode !== 0) {
        throw new Error(`npm install failed with exit code ${installExitCode}`);
      }
      
      console.log(`Starting dev server in ${workingDirectory}...`);
      
      // Start the dev server
      const devProcess = await webContainer.spawn('npm', ['run', 'dev'], {
        cwd: workingDirectory
      });
      
      // Track dev server process
      runningProcesses.current.push({
        name: `dev-server-${workingDirectory}`,
        process: devProcess
      });
      
      // Listen for server output
      devProcess.output.pipeTo(new WritableStream({
        write(data) {
          const output = String(data);
          console.log('Dev server output:', output);
        }
      }));

      // For fullstack projects, also try to start backend server if it exists
      if (workingDirectory === 'frontend') {
        try {
          const backendPackageJson = await webContainer.fs.readFile('backend/package.json', 'utf8');
          const backendData = JSON.parse(backendPackageJson);
          
          if (backendData.scripts?.dev || backendData.scripts?.start) {
            console.log('🔧 Starting backend server...');
            
            // Install backend dependencies first
            const backendInstallProcess = await webContainer.spawn('npm', ['install'], {
              cwd: 'backend'
            });
            
            // Track backend install process
            runningProcesses.current.push({
              name: 'npm-install-backend',
              process: backendInstallProcess
            });
            
            backendInstallProcess.output.pipeTo(new WritableStream({
              write(data) {
                const output = String(data);
                console.log('Backend install output:', output);
              }
            }));
            
            await backendInstallProcess.exit;
            
            // Remove from tracking after completion
            runningProcesses.current = runningProcesses.current.filter(p => p.name !== 'npm-install-backend');
            
            // Start backend dev server
            const backendDevProcess = await webContainer.spawn('npm', ['run', backendData.scripts.dev ? 'dev' : 'start'], {
              cwd: 'backend'
            });
            
            // Track backend dev server process
            runningProcesses.current.push({
              name: 'dev-server-backend',
              process: backendDevProcess
            });
            
            backendDevProcess.output.pipeTo(new WritableStream({
              write(data) {
                const output = String(data);
                console.log('Backend server output:', output);
              }
            }));
            
            console.log('✅ Backend server started');
          }
        } catch (err) {
          console.log('ℹ️ No backend server to start or backend start failed:', err);
        }
      }

      // The port listener will handle setting the URL when the server is ready
      console.log('⏳ Waiting for development server to be ready...');
      
    } catch (error) {
      console.error('❌ Failed to start preview server:', error);
      setError(`Failed to start preview server: ${error}`);
      setIsLoading(false);
      
      // Try retry logic
      if (retryCount < 3) {
        console.log('🔄 Attempting retry...');
        await retryWithBackoff(retryCount);
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  // Main entry point
  async function main() {
    try {
      setIsLoading(true);
      setRetryCount(0);
      await startServers();
    } catch (error) {
      console.error('❌ Error starting servers:', error);
      await retryWithBackoff(0);
    }
  }

  // Handle manual retry
  const handleRetry = async () => {
    await cleanup();
    await main();
  };

  // Update URL when previews change
  useEffect(() => {
    if (previews.length > 0 && !url) {
      // Find the first ready preview or just the first one
      const readyPreview = previews.find(p => p.ready) || previews[0];
      if (readyPreview && readyPreview.baseUrl) {
        setUrl(readyPreview.baseUrl);
        setIsLoading(false);
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
          </div>
        </div>
      )}
      
      {error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-red-400">
            <p className="mb-2">Preview Error:</p>
            <p className="text-sm mb-4">{error}</p>
            <button 
              onClick={handleRetry}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      
      {url && !isLoading && !error && (
        <div className="flex-1 flex flex-col">
          <iframe 
            key={url} // Force remount when URL changes
            width="100%" 
            height="100%" 
            src={url} 
            title="Live Preview"
            className="border-0 flex-1"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            onLoad={() => console.log('Preview iframe loaded')}
            onError={(e) => console.error('Preview iframe error:', e)}
          />
        </div>
      )}
    </div>
  );
}
