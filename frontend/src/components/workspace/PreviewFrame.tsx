import { WebContainer } from '@webcontainer/api';
import { useEffect, useState } from 'react';

interface PreviewFrameProps {
  webContainer: WebContainer;
}

export function PreviewFrame({ webContainer }: PreviewFrameProps) {
  // In a real implementation, this would compile and render the preview
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function main() {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Starting npm install...');
      const installProcess = await webContainer.spawn('npm', ['install']);

      installProcess.output.pipeTo(new WritableStream({
        write(data) {
          console.log(data);
        }
      }));

      // Wait for install to complete
      await installProcess.exit;
      
      console.log('Starting dev server...');
      await webContainer.spawn('npm', ['run', 'dev']);

      // Wait for `server-ready` event
      webContainer.on('server-ready', (port, url) => {
        console.log('Server ready:', url, port);
        setUrl(url);
        setIsLoading(false);
      });
      
    } catch (err) {
      console.error('Preview error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start preview');
      setIsLoading(false);
    }
  }

  useEffect(() => {
    main()
  }, [])
  return (
    <div className="h-full flex items-center justify-center text-gray-400">
      {isLoading && (
        <div className="text-center">
          <p className="mb-2">Starting preview server...</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </div>
      )}
      {error && (
        <div className="text-center text-red-400">
          <p className="mb-2">Preview Error:</p>
          <p className="text-sm">{error}</p>
        </div>
      )}
      {url && !isLoading && !error && (
        <iframe 
          width={"100%"} 
          height={"100%"} 
          src={url} 
          title="Live Preview"
          className="border-0"
        />
      )}
    </div>
  );
}
