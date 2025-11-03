import { useEffect, useState } from 'react'
import { WebContainer } from '@webcontainer/api'

// Bolt-like single shared promise for the WebContainer instance.
// This file exports a hook `useWebcontainer()` (returns WebContainer | undefined)
// and the `webcontainerPromise` which is the shared Promise<WebContainer>.

type WebContainerPromise = Promise<WebContainer>

// Module-level promise that persists across hot reloads naturally
let webcontainerPromise: WebContainerPromise | undefined

// Initialize the promise once
if (!webcontainerPromise && !import.meta.env.SSR) {
  webcontainerPromise = (async () => {
    try {
      console.log('🚀 Starting WebContainer boot...');
      
      // Add timeout to WebContainer boot
      const bootPromise = WebContainer.boot();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('WebContainer boot timeout')), 30000);
      });
      
      const wc = await Promise.race([bootPromise, timeoutPromise]);
      console.log('✅ WebContainer booted successfully');
      return wc;
    } catch (err) {
      console.error('❌ WebContainer.boot failed', err);
      throw err;
    }
  })();
}

export { webcontainerPromise }

export function useWebcontainer(): WebContainer | undefined {
    const [wc, setWc] = useState<WebContainer | undefined>(undefined)

    useEffect(() => {
        let mounted = true

        if (!webcontainerPromise) return

        webcontainerPromise
            .then((instance) => {
                if (!mounted) return
                setWc(instance)
            })
            .catch((err) => {
                console.error('Failed to get WebContainer instance', err)
            })

        return () => {
            mounted = false
        }
    }, [])

    return wc
}

export default useWebcontainer