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


const Workspace = () => {
  const location = useLocation();
  const { prompt } = location.state as { prompt: string };
  const [userPrompt, setPrompt] = useState("");
  const [llmMessages, setLlmMessages] = useState<{role: "user" | "assistant", content: string;}[]>([]);
  const webcontainer=useWebcontainer();
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [steps,setSteps]= useState<Step[]>([]);

  const [files,setFiles]=useState<FileItem[]>([]);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');

  useEffect(() => {
    // Only process if there are pending steps to avoid infinite loops
    const pendingSteps = steps.filter(({status}) => status === "pending");
    if (pendingSteps.length === 0) return;

    console.log('Processing pending steps:', pendingSteps);
    let originalFiles = [...files];
    let updateHappened = false;
    
    pendingSteps.forEach(step => {
      console.log('Processing step:', step);
      if (step?.type === StepType.CreateFile && step.path) {
        updateHappened = true;
        let parsedPath = step.path.split("/").filter(p => p.length > 0); // Remove empty strings
        console.log('Parsed path:', parsedPath, 'for file:', step.path);
        
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
        
        // Create the file
        const fileName = parsedPath[parsedPath.length - 1];
        const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
        
        let file = currentFileStructure.find(x => x.path === filePath);
        if (!file) {
          currentFileStructure.push({
            name: fileName,
            type: 'file',
            path: filePath,
            content: step.code || ''
          });
        } else {
          file.content = step.code || '';
        }
      }
    });

    if (updateHappened) {
      console.log('Final files structure:', originalFiles);
      setFiles(originalFiles);
      setSteps(prevSteps => prevSteps.map((s: Step) => ({
        ...s,
        status: "completed"
      })));
    }
  }, [steps]);

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
    console.log('Sending follow-up message:', message);
    
    // Add user message to conversation
    const newUserMessage = { role: "user" as const, content: message };
    const updatedMessages = [...llmMessages, newUserMessage];
    setLlmMessages(updatedMessages);
    
    try {
      // Send to LLM with full conversation context
      const response = await axios.post(`${BACKEND_URL}/chat`, {
        messages: updatedMessages
      });
      
      if (response.data.response) {
        console.log('Follow-up response received:', response.data.response.substring(0, 200) + '...');
        
        // Add assistant response to conversation
        const assistantMessage = { role: "assistant" as const, content: response.data.response };
        setLlmMessages(prev => [...prev, assistantMessage]);
        
        // Parse the response for new steps
        const newSteps = parseXml(response.data.response).map((x: Step) => ({
          ...x,
          status: "pending" as "pending"
        }));
        
        console.log('Parsed follow-up steps:', newSteps.length);
        if (newSteps.length > 0) {
          setSteps(s => [...s, ...newSteps]);
        }
      }
    } catch (error) {
      console.error('Error sending follow-up message:', error);
    }
  }

  async function init(prompt: string) {
    const response = await axios.post(`${BACKEND_URL}/template`, {
      prompt: prompt.trim()
    });
    const { prompts, uiprompts } = response.data;
    
    // Set initial steps as pending so they get processed by useEffect
    setSteps(parseXml(uiprompts[0]).map((x:Step) => ({
      ...x,
      status:"pending"
    })));

    const stepResponse = await axios.post(`${BACKEND_URL}/chat`, {
      messages: [...prompts, prompt].map(content => ({
        role: "user",
        content
      }))
    });

    // Parse the chat response and add new steps
    if (stepResponse.data.response) {
      console.log('Chat response received:', stepResponse.data.response.substring(0, 200) + '...');
      const newSteps = parseXml(stepResponse.data.response).map((x: Step) => ({
        ...x,
        status: "pending" as "pending"
      }));
      
      console.log('Parsed new steps:', newSteps.length);
      setSteps(s => [...s, ...newSteps]);
    }
    
    // Set initial conversation with all prompts and user input
    const initialMessages = [...prompts, prompt].map(content => ({
      role: "user" as const,
      content
    }));
    
    // Add assistant response to complete the conversation
    setLlmMessages([
      ...initialMessages,
      { role: "assistant" as const, content: stepResponse.data.response }
    ]);
  }

  useEffect(() => {
    const initialPrompt = location.state?.initialPrompt;
    if (initialPrompt) {
      init(initialPrompt);
    }
  }, [location.state]);

  return (
    <div className="h-screen bg-gradient-to-br from-background via-background-secondary to-background-tertiary flex overflow-hidden">
      {/* Left Panel - Chat */}
      <div className="w-[30%] border-r border-glass-border/20">
        <ChatPanel 
          step={steps}
          currentStep={currentStep}
          onStepClick={setCurrentStep}
          onNewMessage={sendMessage}
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