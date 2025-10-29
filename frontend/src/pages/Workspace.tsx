import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ChatPanel from '@/components/workspace/ChatPanel';
import FileExplorer from '@/components/workspace/FileExplorer';
import CodeEditor from '@/components/workspace/CodeEditor';
import { PreviewFrame } from '@/components/workspace/PreviewFrame';
import TabView from '@/components/workspace/TabView';
import axios from "axios"
import {Step,FileItem,StepType} from "../types"
import { BACKEND_URL } from '@/config';
import { parseXml } from '@/steps';
import { useWebcontainer } from '@/hooks/useWebcontainer';

export type AIProvider = 'nvidia' | 'claude';

const Workspace = () => {
  const location = useLocation();
  const { initialPrompt, provider: initialProvider } = location.state as { initialPrompt: string; provider?: AIProvider };
  // Removed unused userPrompt and setPrompt
  const [aiProvider, setAiProvider] = useState<AIProvider>(initialProvider || 'nvidia');
  
  console.log('Workspace initialized with provider:', initialProvider || 'nvidia (default)');
  console.log('Workspace initialized with initialPrompt:', initialPrompt);
  
  const [llmMessages, setLlmMessages] = useState<{role: "user" | "assistant", content: string;}[]>([]);
  const webcontainer=useWebcontainer();
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [steps,setSteps]= useState<Step[]>([]);

  const [files,setFiles]=useState<FileItem[]>([]);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');

  useEffect(() => {
    console.log('=== useEffect triggered ===');
    console.log('Total steps:', steps.length);
    console.log('Steps:', steps.map(s => ({ id: s.id, title: s.title, status: s.status, type: s.type })));
    
    // Only process if there are pending steps to avoid infinite loops
    const pendingSteps = steps.filter(({status}) => status === "pending");
    console.log('Pending steps count:', pendingSteps.length);
    
    if (pendingSteps.length === 0) {
      console.log('No pending steps to process, exiting useEffect');
      return;
    }

    console.log('Processing pending steps:', pendingSteps.map(s => ({ id: s.id, title: s.title, type: s.type })));
    console.log('Current files count:', files.length);
    let originalFiles = [...files];
    let updateHappened = false;
    
    pendingSteps.forEach(step => {
      console.log('Processing step:', step);
      if (step?.type === StepType.CreateFile && step.path) {
        updateHappened = true;
        let parsedPath = step.path.split("/").filter(p => p.length > 0); // Remove empty strings
        console.log('Parsed path:', parsedPath, 'for file:', step.path);
        console.log('File content length:', step.code?.length || 0);
        
        // Build the file structure
        let currentFileStructure = originalFiles;
        let currentPath = "";
        
        // Navigate/create folders
        for (let i = 0; i < parsedPath.length - 1; i++) {
          const folderName = parsedPath[i];
          currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
          
          let folder = currentFileStructure.find(x => x.path === currentPath && x.type === 'folder');
          if (!folder) {
            // Create the folder
            folder = {
              name: folderName,
              type: 'folder',
              path: currentPath,
              children: []
            };
            currentFileStructure.push(folder);
            console.log('Created folder:', currentPath);
          }
          currentFileStructure = folder.children!;
        }
        
        // Create or update the file
        const fileName = parsedPath[parsedPath.length - 1];
        const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
        
        let file = currentFileStructure.find(x => x.path === filePath);
        if (!file) {
          console.log('Creating NEW file:', filePath);
          currentFileStructure.push({
            name: fileName,
            type: 'file',
            path: filePath,
            content: step.code || ''
          });
        } else {
          console.log('Updating EXISTING file:', filePath);
          file.content = step.code || '';
        }
      }
    });

    if (updateHappened) {
      console.log('Final files structure:', originalFiles);
      console.log('Total files after update:', originalFiles.length);
      setFiles(originalFiles);

      // Auto-select main file after files update
      // Try to select src/App.jsx, then src/main.jsx, then first file
      const findFile = (filesArr, path) => {
        for (const f of filesArr) {
          if (f.type === 'file' && f.path === path) return f;
          if (f.type === 'folder' && f.children) {
            const found = findFile(f.children, path);
            if (found) return found;
          }
        }
        return null;
      };
      let mainFile = findFile(originalFiles, 'src/App.jsx') || findFile(originalFiles, 'src/main.jsx');
      if (!mainFile) {
        // fallback: first file in the structure
        const getFirstFile = (filesArr) => {
          for (const f of filesArr) {
            if (f.type === 'file') return f;
            if (f.type === 'folder' && f.children) {
              const found = getFirstFile(f.children);
              if (found) return found;
            }
          }
          return null;
        };
        mainFile = getFirstFile(originalFiles);
      }
      if (mainFile) {
        setSelectedFile(mainFile);
        console.log('Auto-selected file:', mainFile.path);
      }

      // Only mark the PENDING steps as completed, not all steps
      setSteps(prevSteps => prevSteps.map((s: Step) => {
        const wasPending = pendingSteps.find(ps => ps.id === s.id);
        if (wasPending) {
          console.log('Marking step as completed:', s.id, s.title);
          return { ...s, status: "completed" as "completed" };
        }
        return s;
      }));
    }
  }, [steps, files]);

  useEffect(() => {
    const createMountStructure = (files: FileItem[]): Record<string, any> => {
      const mountStructure: Record<string, any> = {};
  
      const processFile = (file: FileItem, isRootFolder: boolean) => {  
        if (file.type === 'folder') {
          // For folders, create a directory entry
          mountStructure[file.name] = {
            directory: file.children ? 
              Object.fromEntries(
                file.children.map(child => [child.name, processFile(child, false)])
              ) 
              : {}
          };
        } else if (file.type === 'file') {
          if (isRootFolder) {
            mountStructure[file.name] = {
              file: {
                contents: file.content || ''
              }
            };
          } else {
            // For files, create a file entry with contents
            return {
              file: {
                contents: file.content || ''
              }
            };
          }
        }
  
        return mountStructure[file.name];
      };
  
      // Process each top-level file/folder
      files.forEach(file => processFile(file, true));
  
      return mountStructure;
    };
  
    const mountStructure = createMountStructure(files);
  
    // Mount the structure if WebContainer is available
    console.log(mountStructure);
    webcontainer?.mount(mountStructure);
  }, [files, webcontainer]);

  async function sendMessage(message: string) {
    console.log('🔵 SEND MESSAGE CALLED');
    console.log('Message:', message);
    console.log('Using AI provider:', aiProvider);
    console.log('Current conversation messages:', llmMessages.length);
    
    // Add user message to conversation
    const newUserMessage = { role: "user" as const, content: message };
    const updatedMessages = [...llmMessages, newUserMessage];
    setLlmMessages(updatedMessages);
    
    console.log('Updated messages count:', updatedMessages.length);
    console.log('Messages to send:', updatedMessages);
    
    try {
      console.log('⏳ Sending to chat endpoint...');
      console.log('URL:', `${BACKEND_URL}/chat`);
      console.log('Payload:', { messages: updatedMessages, provider: aiProvider });
      
      const startTime = Date.now();
      
      // Send to LLM with full conversation context
      const response = await axios.post(`${BACKEND_URL}/chat`, {
        messages: updatedMessages,
        provider: aiProvider
      }, {
        timeout: 300000 // 5 minutes (300 seconds) timeout
      });
      
      const duration = Date.now() - startTime;
      console.log(`✅ CHAT RESPONSE RECEIVED in ${duration}ms`);
      
      console.log('Response received from provider:', aiProvider);
      console.log('=== AI RESPONSE START ===');
      console.log(response.data.response);
      console.log('=== AI RESPONSE END ===');
      
      if (response.data.response) {
        console.log('Follow-up response received:', response.data.response.substring(0, 200) + '...');
        
        // Add assistant response to conversation
        const assistantMessage = { role: "assistant" as const, content: response.data.response };
        setLlmMessages(prev => [...prev, assistantMessage]);
        
        // Parse the response for new steps
        const newSteps = parseXml(response.data.response).map((x: Step, index: number) => ({
          ...x,
          id: (steps.length > 0 ? Math.max(...steps.map(s => s.id || 0)) : 0) + index + 1, // Generate unique IDs
          status: "pending" as "pending"
        }));
        
        console.log('Parsed follow-up steps:', newSteps.length);
        console.log('New steps with unique IDs:', newSteps.map(s => ({ id: s.id, title: s.title })));
        if (newSteps.length > 0) {
          setSteps(s => [...s, ...newSteps]);
        }
      }
    } catch (error) {
      console.error('Error sending follow-up message:', error);
      
      // Show user-friendly error message
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          alert(`⏱️ Request timeout!\n\nThe ${aiProvider.toUpperCase()} API is taking too long to respond.\n\nSuggestions:\n1. Try again\n2. Switch to ${aiProvider === 'nvidia' ? 'Claude' : 'NVIDIA'} provider\n3. Simplify your request`);
        } else if (error.response?.status === 504) {
          alert(`⏱️ ${error.response.data.message || 'Request timeout'}\n\n${error.response.data.suggestion || 'Try switching providers'}`);
        } else {
          alert(`❌ Error: ${error.response?.data?.message || error.message}\n\nPlease try again or switch providers.`);
        }
      }
    }
  }

  async function init(prompt: string) {
    console.log('🚀 INIT FUNCTION CALLED');
    console.log('Provider:', aiProvider);
    console.log('Prompt:', prompt);
    console.log('Backend URL:', BACKEND_URL);
    
    try {
      console.log('Initializing with provider:', aiProvider);
      console.log('Fetching template...');
      console.log('Making request to:', `${BACKEND_URL}/template`);
      // Get the template (basic project structure)
      const response = await axios.post(`${BACKEND_URL}/template`, {
        prompt: prompt.trim(),
        provider: aiProvider
      }, {
        timeout: 300000 // 5 minutes (300 seconds) for template generation
      });
      console.log('✅ RESPONSE RECEIVED!');
      console.log('Response status:', response.status);
      console.log('Response data:', response.data);
      console.log('Template response received from provider:', aiProvider);
  const { uiprompts } = response.data;
      console.log('=== TEMPLATE UI PROMPTS ===');
      console.log(uiprompts[0]);
      console.log('=== END TEMPLATE UI PROMPTS ===');
      // Parse template and set as initial steps
      const templateSteps = parseXml(uiprompts[0]).map((x: Step) => ({
        ...x,
        status: "pending" as "pending"
      }));
      console.log('Template steps parsed:', templateSteps.length);
      console.log('Template steps:', templateSteps.map(s => ({ id: s.id, title: s.title, type: s.type })));
      // Set template files immediately
      setSteps(templateSteps);
      console.log('✅ Steps set, triggering file creation via useEffect');
      // Initialize conversation context for future messages
      setLlmMessages([{
        role: "user" as const,
        content: prompt
      }]);
      console.log('✅ Initialization complete! Files from template are being created.');
      // Automatically trigger codegen after template
      await sendMessage(prompt);
    } catch (error) {
      console.error('Error during initialization:', error);
      // Show user-friendly error message
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          alert(`⏱️ Request timeout during initialization!\n\nThe ${aiProvider.toUpperCase()} API is taking too long to respond.\n\nSuggestions:\n1. Reload and try again\n2. Switch to ${aiProvider === 'nvidia' ? 'Claude' : 'NVIDIA'} provider`);
        } else if (error.response?.status === 504) {
          alert(`⏱️ ${error.response.data.message || 'Request timeout'}\n\n${error.response.data.suggestion || 'Try switching providers'}`);
        } else {
          alert(`❌ Initialization Error: ${error.response?.data?.message || error.message}\n\nPlease reload and try again.`);
        }
      }
    }
  }

  useEffect(() => {
    console.log('=== Init useEffect triggered ===');
    console.log('location.state:', location.state);
    const initialPrompt = location.state?.initialPrompt;
    console.log('initialPrompt:', initialPrompt);
    if (initialPrompt) {
      console.log('Calling init with prompt:', initialPrompt);
      init(initialPrompt);
    } else {
      console.log('No initialPrompt found, skipping init');
    }
  }, []);

  return (
    <div className="h-screen bg-gradient-to-br from-background via-background-secondary to-background-tertiary flex overflow-hidden">
      {/* Left Panel - Chat */}
      <div className="w-[30%] border-r border-glass-border/20">
        <ChatPanel 
          step={steps}
          currentStep={currentStep}
          onStepClick={setCurrentStep}
          onNewMessage={sendMessage}
          provider={aiProvider}
          onProviderChange={setAiProvider}
        />
      </div>

      {/* Middle Panel - File Explorer */}
      <div className="w-[20%] border-r border-glass-border/20">
        <FileExplorer 
          files={files}
          onFileSelect={(file: FileItem) => {
            console.log('Workspace: File selected:', file.name, 'Content length:', file.content?.length || 0);
            setSelectedFile(file);
          }}
        />
      </div>

      {/* Right Panel - TabView with CodeEditor and PreviewFrame */}
      <div className="w-1/2 flex flex-col">
        <TabView activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="h-[calc(100%-4rem)]">
          {activeTab === 'code' ? (
            <CodeEditor 
              file={selectedFile || undefined}
              onSave={(content) => {
                console.log('Workspace: Saving file:', selectedFile?.name, 'Content length:', content.length);
                // File saved successfully
              }}
            />
          ) : (
            webcontainer ? <PreviewFrame webContainer={webcontainer} /> : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <p>WebContainer not available</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default Workspace;