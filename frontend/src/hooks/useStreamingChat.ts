import { useState, useCallback } from 'react';
import { StreamingXMLParser } from '@/streamingXMLParser';
import { Step } from '@/types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

interface UseStreamingChatOptions {
  onStepFound: (step: Step) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
  maxStepId?: number;
}

export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');

  const sendStreamingMessage = useCallback(async (
    messages: Array<{ role: string; content: string }>,
    provider: string,
    options: UseStreamingChatOptions
  ) => {
    setIsStreaming(true);
    setCurrentResponse('');
    
    try {
      // Create streaming parser with proper step ID handling
      const parser = new StreamingXMLParser(options.onStepFound, options.maxStepId || 1);
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 900000); // 15 minutes
      
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: JSON.stringify({
          messages,
          provider,
          stream: true,
          realTimeStream: true
        }),
        signal: controller.signal,
        // Add keepalive to prevent connection drops
        keepalive: true
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let retryCount = 0;
      const maxRetries = 3;

      try {
        while (true) {
          try {
            const { done, value } = await reader.read();
            
            if (done) {
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            
            // Filter out heartbeat newlines and empty chunks
            if (chunk.trim() === '') {
              continue;
            }
            
            fullResponse += chunk;
            setCurrentResponse(fullResponse);
            
            // Process chunk through streaming parser
            parser.processChunk(chunk);
            
            // Reset retry count on successful read
            retryCount = 0;
            
          } catch (readError) {
            console.warn('Read error, retrying...', readError);
            retryCount++;
            
            if (retryCount > maxRetries) {
              throw new Error(`Max retries (${maxRetries}) exceeded. Last error: ${readError}`);
            }
            
            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
          }
        }
        
        // Finalize parsing to catch any incomplete elements
        parser.finalize();
        
        // Check if response might be incomplete (doesn't end with closing tags)
        const responseEndsCorrectly = fullResponse.trim().endsWith('</boltArtifact>') || 
                                       fullResponse.trim().endsWith('</boltAction>');
        
        if (!responseEndsCorrectly) {
          console.warn('⚠️ WARNING: AI response might be incomplete!');
          console.warn('  - Response length:', fullResponse.length, 'characters');
          console.warn('  - Last 100 chars:', fullResponse.slice(-100));
          console.warn('  - Possible cause: Token limit reached or connection issue');
        }
        
        // Call completion callback
        options.onComplete(fullResponse);
        
      } catch (readerError) {
        console.error('Reader error:', readerError);
        throw readerError;
      } finally {
        try {
          reader.releaseLock();
        } catch (releaseError) {
          console.warn('Error releasing reader lock:', releaseError);
        }
      }
      
    } catch (error) {
      console.error('Streaming chat error:', error);
      options.onError(error as Error);
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return {
    sendStreamingMessage,
    isStreaming,
    currentResponse
  };
}