import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ChatPanel from '@/components/workspace/ChatPanel';
import FileExplorer from '@/components/workspace/FileExplorer';
import CodeEditor from '@/components/workspace/CodeEditor';
import { PreviewFrame } from '@/components/workspace/PreviewFrame';
import TabView from '@/components/workspace/TabView';
import {Step,FileItem,StepType} from "../types"
import { BACKEND_URL } from '@/config';
import { StreamingXMLParser } from '@/streamingXMLParser';
import { useWebcontainer, webcontainerPromise } from '@/hooks/useWebcontainer';
import { projectService } from '@/services/projectService';
import { Home, Save, Loader2, RefreshCw, RotateCcw } from 'lucide-react';

export type AIProvider = 'nvidia' | 'claude';

const Workspace = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  
  // Handle both new projects (with initialPrompt in state) and existing projects (with projectId in URL)
  const locationState = location.state as { initialPrompt?: string; provider?: AIProvider } | null;
  const { initialPrompt = '', provider: initialProvider } = locationState || {};
  
  // Removed unused userPrompt and setPrompt
  const [aiProvider, setAiProvider] = useState<AIProvider>(initialProvider || 'nvidia');
  
  // Add new states for streaming indicator and project saving
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(urlProjectId || null);
  const [projectName, setProjectName] = useState<string>('');
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  
  // Store the current prompt (either from initialPrompt or loaded from project)
  const [currentPrompt, setCurrentPrompt] = useState<string>(initialPrompt || '');
  
  // Track running dev server processes for cleanup
  const runningProcessesRef = useRef<any[]>([]);
  
  console.log('Workspace initialized with provider:', initialProvider || 'nvidia (default)');
  console.log('Workspace initialized with initialPrompt:', initialPrompt);
  console.log('Workspace initialized with urlProjectId:', urlProjectId);
  
  const [llmMessages, setLlmMessages] = useState<{role: "user" | "assistant", content: string;}[]>([]);
  const webcontainer=useWebcontainer();
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [steps,setSteps]= useState<Step[]>([]);
  // Track pending file operations in a ref so async loops can read the latest value without stale closures
  const pendingFileOperationsRef = useRef<number>(0);

  const incrementPendingFileOperations = () => {
    const next = pendingFileOperationsRef.current + 1;
    pendingFileOperationsRef.current = next;
    return next;
  };

  const decrementPendingFileOperations = () => {
    const next = Math.max(0, pendingFileOperationsRef.current - 1);
    pendingFileOperationsRef.current = next;
    return next;
  };

  // Load existing project if projectId is provided
  const loadExistingProject = async (id: string) => {
    setIsLoadingProject(true);
    try {
      console.log(`📂 Loading existing project: ${id}`);
      const response = await projectService.getProject(id);
      
      if (response.success && response.project) {
        const project = response.project;
        setProjectName(project.name);
        setLlmMessages(project.conversation || []);
        
        // Set initialPrompt from loaded project to avoid validation errors when saving
        if (project.prompt && project.prompt.trim()) {
          setCurrentPrompt(project.prompt);
          console.log('📝 Restored project prompt:', project.prompt);
        } else {
          // Fallback if project has no prompt (shouldn't happen but be safe)
          const fallbackPrompt = `Continue development of: ${project.name}`;
          setCurrentPrompt(fallbackPrompt);
          console.log('⚠️ Project had no prompt, using fallback:', fallbackPrompt);
        }
        
        // Parse and restore files structure
        if (project.files) {
          console.log(`📁 Restoring ${project.files.length} files`);
          console.log('📋 File list:', project.files.map(f => f.path));
          
          // Build hierarchical file structure for UI
          const buildFileTree = (files: any[]): FileItem[] => {
            const root: FileItem[] = [];
            const folderMap = new Map<string, FileItem>();
            
            // Sort files so folders are created before their contents
            const sortedFiles = files.sort((a, b) => a.path.localeCompare(b.path));
            
            for (const file of sortedFiles) {
              const pathParts = file.path.split('/').filter(p => p.length > 0);
              let currentPath = '';
              let currentLevel = root;
              
              // Create folder structure
              for (let i = 0; i < pathParts.length - 1; i++) {
                const folderName = pathParts[i];
                currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
                
                let folder = folderMap.get(currentPath);
                if (!folder) {
                  folder = {
                    name: folderName,
                    type: 'folder',
                    path: currentPath,
                    children: []
                  };
                  folderMap.set(currentPath, folder);
                  currentLevel.push(folder);
                }
                currentLevel = folder.children!;
              }
              
              // Add the file
              if (file.type === 'file') {
                const fileName = pathParts[pathParts.length - 1];
                currentLevel.push({
                  name: fileName,
                  type: 'file',
                  path: file.path,
                  content: file.content
                });
              }
            }
            
            return root;
          };
          
          const fileTree = buildFileTree(project.files);
          console.log('🌳 Built file tree with', fileTree.length, 'root items');
          
          // Debug the file tree structure
          fileTree.forEach(item => {
            if (item.type === 'folder') {
              console.log(`  📁 Root folder: ${item.path} (${item.children?.length || 0} children)`);
              if (item.children) {
                item.children.forEach(child => {
                  console.log(`    ${child.type === 'folder' ? '📁' : '📄'} ${child.path}`);
                });
              }
            } else {
              console.log(`  📄 Root file: ${item.path}`);
            }
          });
          
          setFiles(fileTree);
          
          // Add delay to check if state updated correctly
          setTimeout(() => {
            console.log('📁 Files ref after setState:', filesRef.current.length);
            console.log('📁 Files ref structure:');
            filesRef.current.forEach(item => {
              console.log(`  ${item.type === 'folder' ? '📁' : '📄'} ${item.path}`);
            });
          }, 100);
          
          // If WebContainer is available, restore files to it with strict sequencing
          try {
            // Await the webcontainer promise directly for reliable sequencing
            const wc = await webcontainerPromise;
            if (wc) {
              console.log(`🔄 Saving ${project.files.length} files to WebContainer with strict sequencing...`);
              let savedCount = 0;
              let skippedCount = 0;
              
              // Save all files sequentially to ensure proper order
              for (const file of project.files) {
                if (file.type === 'file' && file.content) {
                  console.log(`💾 Saving to WebContainer: ${file.path} (${file.content.length} chars)`);
                  await saveFileToWebcontainer(file.path, file.content);
                  savedCount++;
                } else {
                  console.log(`⏭️ Skipping: ${file.path} (${file.type}, no content: ${!file.content})`);
                  skippedCount++;
                }
              }
              console.log(`✅ Saved ${savedCount} files, skipped ${skippedCount} to WebContainer`);
              
              // After ALL files are saved, verify and then start dev server
              console.log('🔍 Verifying all files are present before starting dev server...');
              await verifyAndResyncFiles();
              
              // Now check for development workflow (this will start dev server if package.json found)
              await checkForDevelopmentWorkflow();
            } else {
              console.warn(`⚠️ WebContainer not available, files only saved to UI state`);
            }
          } catch (error) {
            console.error('❌ Error during WebContainer file restoration:', error);
          }
        }
        
        // Parse and restore steps if available
        if (project.steps) {
          console.log(`📋 Restoring ${project.steps.length} steps`);
          // Convert ProjectStep[] to Step[]
          const stepItems: Step[] = project.steps.map(step => ({
            id: step.id,
            title: step.title,
            description: step.description,
            type: StepType.CreateFile, // Default to CreateFile for now
            status: step.status === 'failed' ? 'completed' : step.status as 'pending' | 'completed',
            code: step.code,
            path: step.path
          }));
          console.log('📋 Setting steps state with:', stepItems.length, 'items');
          setSteps(stepItems);
          
          // Add a small delay to check if refs get updated
          setTimeout(() => {
            console.log('📋 Steps ref after setState:', stepsRef.current.length);
          }, 100);
        } else {
          console.log('📋 No steps found in project data');
        }
        
        console.log(`✅ Project loaded: ${project.name}`);
        
        // Add debugging for final state after all setState calls
        setTimeout(() => {
          console.log('🔍 Final state check after project load:');
          console.log('  - Files ref count:', filesRef.current.length);
          console.log('  - Steps ref count:', stepsRef.current.length);
          console.log('  - File tree structure:');
          filesRef.current.forEach((item) => {
            if (item.type === 'folder') {
              console.log(`    📁 ${item.path} (${item.children?.length || 0} children)`);
            } else {
              console.log(`    📄 ${item.path}`);
            }
          });
        }, 200);
        
        // Debug: Check if main files exist in WebContainer
        if (webcontainer) {
          setTimeout(async () => {
            try {
              const files = await webcontainer.fs.readdir('.', { withFileTypes: true });
              console.log('🔍 WebContainer root files:', files.map(f => f.name));
              
              // Check for src directory
              try {
                const srcFiles = await webcontainer.fs.readdir('src', { withFileTypes: true });
                console.log('🔍 WebContainer src files:', srcFiles.map(f => f.name));
                
                // Check if main.tsx exists
                try {
                  const mainTsx = await webcontainer.fs.readFile('src/main.tsx', 'utf-8');
                  console.log('🔍 main.tsx exists, length:', mainTsx.length);
                } catch (e) {
                  console.error('❌ main.tsx not found:', e);
                }
              } catch (e) {
                console.log('🔍 No src directory found in WebContainer');
                
                // Try to recreate missing src files
                console.log('🔧 Attempting to recreate src directory and files...');
                const srcFiles = project.files.filter(f => f.path.startsWith('src/'));
                console.log('📋 Found src files in project:', srcFiles.map(f => f.path));
                
                for (const file of srcFiles) {
                  if (file.content) {
                    console.log(`🔧 Recreating: ${file.path}`);
                    await saveFileToWebcontainer(file.path, file.content);
                  }
                }
              }
            } catch (err) {
              console.error('🔍 Error reading WebContainer files:', err);
            }
          }, 3000);
        }
      }
    } catch (error) {
      console.error('❌ Error loading project:', error);
    } finally {
      setIsLoadingProject(false);
    }
  };

  // Function to verify and resync files with WebContainer
  const verifyAndResyncFiles = async () => {
    try {
      // Await the webcontainer promise directly
      const wc = await webcontainerPromise;
      if (!wc) {
        console.warn('❌ WebContainer not available for file verification');
        return;
      }

      console.log('🔍 Verifying files in WebContainer...');
      
      const flattenFiles = (fileItems: FileItem[]): FileItem[] => {
        const result: FileItem[] = [];
        for (const item of fileItems) {
          if (item.type === 'file') {
            result.push(item);
          } else if (item.type === 'folder' && item.children) {
            result.push(...flattenFiles(item.children));
          }
        }
        return result;
      };

      const allFiles = flattenFiles(files);
      let missingFiles = 0;
      let savedFiles = 0;

      for (const file of allFiles) {
        try {
          await wc.fs.readFile(file.path, 'utf-8');
          console.log(`✅ Verified: ${file.path}`);
        } catch (error) {
          console.warn(`❌ Missing in WebContainer: ${file.path}`);
          if (file.content) {
            await saveFileToWebcontainer(file.path, file.content);
            savedFiles++;
          }
          missingFiles++;
        }
      }

      if (missingFiles > 0) {
        console.log(`🔄 Resynced ${savedFiles} missing files to WebContainer`);
        // After resyncing, check for development workflow
        setTimeout(() => {
          checkForDevelopmentWorkflow();
        }, 1000);
      } else {
        console.log(`✅ All ${allFiles.length} files verified in WebContainer`);
      }
    } catch (error) {
      console.error('❌ Error during file verification:', error);
    }
  };

  // Cleanup function for dev server processes and coordination state
  const cleanupDevServerProcesses = async () => {
    if (runningProcessesRef.current.length > 0) {
      console.log(`🧹 Cleaning up ${runningProcessesRef.current.length} dev server processes...`);
      
      for (const process of runningProcessesRef.current) {
        try {
          await process.kill();
          console.log('✅ Dev server process terminated');
        } catch (err) {
          console.log('ℹ️ Process already terminated or error killing:', err);
        }
      }
      
      // Clear the tracked processes
      runningProcessesRef.current = [];
      console.log('✅ All dev server processes cleaned up');
      
      // Reset preview state
      setIsPreviewReady(false);
    }
    
    // Reset WebContainer coordination state
    resetWebContainerCoordinationState();
  };

  // Reset all WebContainer coordination state for fresh start
  const resetWebContainerCoordinationState = () => {
    console.log('🔄 Resetting WebContainer coordination state...');
    
    // Clear any pending debounce timers
    for (const [, timer] of packageInstallDebounceRef.current.entries()) {
      clearTimeout(timer);
    }
    
    // Clear all coordination maps and sets
    packageInstallLocksRef.current.clear();
    devServerSpawnedRef.current.clear();
    fileWriteQueueRef.current.clear();
    packageInstallationStatusRef.current.clear();
    packageInstallDebounceRef.current.clear();
    
    console.log('✅ WebContainer coordination state reset');
  };

  // Get current coordination status for debugging/monitoring
  const getCoordinationStatus = () => {
    const status = {
      packageInstalls: Object.fromEntries(packageInstallationStatusRef.current),
      devServersSpawned: Array.from(devServerSpawnedRef.current),
      pendingFileWrites: fileWriteQueueRef.current.size,
      activeDebounces: packageInstallDebounceRef.current.size,
      runningProcesses: runningProcessesRef.current.length
    };
    console.log('📊 WebContainer Coordination Status:', status);
    return status;
  };

  // Effect to load existing project on mount
  useEffect(() => {
    if (urlProjectId && !initialPrompt) {
      // Use webcontainerPromise directly for reliable loading
      const loadWhenReady = async () => {
        try {
          console.log('⏳ Waiting for WebContainer to be ready...');
          const wc = await webcontainerPromise;
          
          if (wc) {
            console.log('✅ WebContainer ready, loading project...');
            await loadExistingProject(urlProjectId);
          } else {
            console.error('❌ WebContainer failed to initialize');
          }
        } catch (error) {
          console.error('❌ Error waiting for WebContainer:', error);
        }
      };
      loadWhenReady();
    }
  }, [urlProjectId, initialPrompt]);

  // Effect to handle cleanup when component unmounts or project changes
  useEffect(() => {
    return () => {
      console.log('🧹 Workspace cleanup - terminating dev servers...');
      cleanupDevServerProcesses();
    };
  }, []);

  // Effect to cleanup when project changes
  useEffect(() => {
    // Cleanup previous project's dev servers when switching projects
    if (projectId) {
      console.log(`🔄 Project changed to: ${projectId}, cleaning up previous state...`);
      cleanupDevServerProcesses();
    }
  }, [projectId]);

  // Add function to save project to MongoDB
  const saveProject = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      console.log('💾 Saving project to database...');
      console.log('📊 Current project state:');
      console.log('  - Files count:', filesRef.current.length);
      console.log('  - Steps count:', stepsRef.current.length);
      console.log('  - Messages count:', messagesRef.current.length);
      
      // Log all files for debugging
      filesRef.current.forEach(file => {
        console.log(`  📄 File: ${file.path} (${file.content?.length || 0} chars)`);
      });
      
      // Generate project name if not set - use the original prompt as the name
      const finalProjectName = projectName || currentPrompt || initialPrompt || `Project ${new Date().toLocaleDateString()}`;
      
      // Ensure we have a valid prompt - this is required by the backend schema
      // If currentPrompt is empty (when continuing an existing project), use the project name or a default
      const validPrompt = (currentPrompt && currentPrompt.trim()) || (initialPrompt && initialPrompt.trim())
        ? (currentPrompt || initialPrompt).trim()
        : projectName && projectName.trim()
        ? `Continue development of: ${projectName.trim()}`
        : `AI-generated project created on ${new Date().toLocaleDateString()}`;
      
      console.log('📝 Project prompt for save:', validPrompt);
      
      // Convert files to the format expected by the backend
      // Flatten the hierarchical file structure and only include actual files
      const flattenFilesForSave = (fileItems: FileItem[]): FileItem[] => {
        const result: FileItem[] = [];
        for (const item of fileItems) {
          if (item.type === 'file') {
            result.push(item);
          } else if (item.type === 'folder' && item.children) {
            result.push(...flattenFilesForSave(item.children));
          }
        }
        return result;
      };
      
      const flatFiles = flattenFilesForSave(filesRef.current);
      const projectFiles = flatFiles
        .filter(file => file.content && file.content.trim().length > 0)
        .map(file => ({
          path: file.path,
          content: file.content!,
          type: file.type,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));
      
      console.log('📤 Processing files for backend:');
      console.log('  - Total items in file tree:', filesRef.current.length);
      console.log('  - Flattened files count:', flatFiles.length);
      
      // Log all flattened files for debugging
      flatFiles.forEach((file, index) => {
        console.log(`  📄 File ${index}: ${file.path} (type: ${file.type}, content: ${file.content?.length || 0} chars)`);
        if (file.type === 'file' && (!file.content || file.content.trim().length === 0)) {
          console.warn(`  ⚠️ File ${file.path} has empty content and will be filtered out`);
        }
      });
      
      console.log('📤 Sending files to backend:', projectFiles.length);
      projectFiles.forEach(file => {
        console.log(`  📄 Sending: ${file.path} (${file.content?.length || 0} chars)`);
      });
      
      // Convert steps to the format expected by the backend
      const projectSteps = stepsRef.current.map(step => ({
        id: step.id || 0,
        title: step.title,
        description: step.description || '',
        type: step.type.toString(), // Convert enum to string
        status: step.status === 'in-progress' ? 'pending' : step.status as 'pending' | 'completed',
        code: step.code,
        path: step.path,
        createdAt: new Date().toISOString()
      }));
      
      // Convert conversation messages
      const conversation = messagesRef.current.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date().toISOString()
      }));
      
      const projectData = {
        name: finalProjectName,
        description: `AI-generated project using ${aiProvider}`,
        prompt: validPrompt, // Use the validated prompt
        aiProvider,
        template: 'react', // Default template
        files: projectFiles,
        steps: projectSteps,
        conversation,
        status: 'active' as const
      };
      
      // Final validation to ensure prompt is never empty
      if (!projectData.prompt || projectData.prompt.trim().length === 0) {
        console.warn('⚠️ Empty prompt detected, using fallback');
        projectData.prompt = `AI Project created on ${new Date().toLocaleDateString()}`;
      }
      
      console.log('📤 Final project data validation:');
      console.log('  - Name:', projectData.name);
      console.log('  - Prompt:', projectData.prompt);
      console.log('  - Files:', projectData.files.length);
      console.log('  - Steps:', projectData.steps.length);
      
      if (projectId) {
        // Update existing project
        await projectService.updateProject(projectId, projectData);
        console.log('✅ Project updated successfully');
      } else {
        // Create new project
        const response = await projectService.createProject(projectData);
        setProjectId(response.project.id);
        console.log('✅ Project created successfully with ID:', response.project.id);
      }
      
      setProjectName(finalProjectName);
    } catch (error) {
      console.error('❌ Error saving project:', error);
      
      // Show more specific error messages
      if (error instanceof Error) {
        alert(`❌ Project Error: ${error.message}\n\nPlease try again.`);
      } else {
        alert('❌ Failed to save project. Please check your network connection and try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Enhanced navigation function with cleanup
  const navigateHome = () => {
    console.log('🏠 Navigating home - cleaning up workspace...');
    cleanupDevServerProcesses();
    navigate('/');
  };
  // Error feedback and auto-fix system
  const [errorFeedbackState, setErrorFeedbackState] = useState<{
    isActive: boolean;
    errors: Array<{
      id: string;
      file: string;
      line?: number;
      column?: number;
      message: string;
      timestamp: number;
      isFixed: boolean;
    }>;
    isProcessingFix: boolean;
    fixAttempts: number;
    maxFixAttempts: number;
  }>({
    isActive: false,
    errors: [],
    isProcessingFix: false,
    fixAttempts: 0,
    maxFixAttempts: 3
  });

  // Send error to AI for automatic fixing
  const sendErrorForFix = async (error: {
    file: string;
    line?: number;
    column?: number;
    message: string;
  }) => {
    if (!webcontainer || errorFeedbackState.isProcessingFix) return;

    try {
      setErrorFeedbackState(prev => ({ ...prev, isProcessingFix: true }));
      console.log('🔧 Sending error to AI for automatic fix...');

      // Collect current project files for context
      const projectFiles = await collectProjectFiles();
      
      // Generate project context description
      const projectContext = `Project: ${projectName || 'Web Application'}
Original Prompt: ${initialPrompt}
Project Type: ${initialPrompt.toLowerCase().includes('react') ? 'React' : 
              initialPrompt.toLowerCase().includes('node') ? 'Node.js' : 
              'Full-stack'}
Files Count: ${filesRef.current.length}
Current Focus: Building a ${initialPrompt.toLowerCase().includes('todo') ? 'todo application' :
                         initialPrompt.toLowerCase().includes('dashboard') ? 'dashboard' :
                         initialPrompt.toLowerCase().includes('calculator') ? 'calculator' :
                         'web application'}`;

      const errorPayload = {
        errorMessage: error.message,
        errorFile: error.file,
        errorLine: error.line,
        errorColumn: error.column,
        projectContext,
        projectFiles,
        provider: aiProvider
      };

      console.log('📤 Sending error payload:', errorPayload);

      const response = await fetch(`${BACKEND_URL}/error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorPayload),
        signal: AbortSignal.timeout(120000) // 2 minutes for error fixing
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.fixApplied && data.response) {
        console.log('✅ AI fix received, applying...');
        
        // Process the fix response with streaming parser
        const errorStreamingParser = new StreamingXMLParser(handleStreamingStep, 1);
        errorStreamingParser.processChunk(data.response);
        errorStreamingParser.finalize();

        // Wait for fix to be applied
        let fixWaitTime = 0;
        const maxFixWaitTime = 30000; // 30 seconds
        while (pendingFileOperationsRef.current > 0 && fixWaitTime < maxFixWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 500));
          fixWaitTime += 500;
        }

        // Mark error as fixed
        setErrorFeedbackState(prev => ({
          ...prev,
          errors: prev.errors.map(err => 
            err.file === error.file && err.message === error.message 
              ? { ...err, isFixed: true }
              : err
          )
        }));

        console.log('🎯 Error fix applied successfully');
        
        // Automatically re-run error detection after fix is applied (with delay)
        setTimeout(() => {
          console.log('🔄 Re-checking for errors after fix...');
          errorDetectionAndFixing(true); // Pass true to indicate this is a re-check
        }, 8000); // Wait 8 seconds for fix to settle
        
      }

    } catch (error) {
      console.error('❌ Error feedback failed:', error);
    } finally {
      setErrorFeedbackState(prev => ({ ...prev, isProcessingFix: false }));
    }
  };

  // Collect current project files for error context
  const collectProjectFiles = async (): Promise<Array<{path: string; content: string}>> => {
    if (!webcontainer) return [];

    try {
      const projectFiles: Array<{path: string; content: string}> = [];
      
      for (const file of filesRef.current) {
        if (file.type === 'file' && file.content) {
          projectFiles.push({
            path: file.path,
            content: file.content
          });
        }
      }
      
      return projectFiles;
    } catch (error) {
      console.error('❌ Error collecting project files:', error);
      return [];
    }
  };

  // Monitor for compilation/runtime errors
  const monitorForErrors = async () => {
    if (!webcontainer) return;

    try {
      // Check for TypeScript/ESLint errors
      const checkErrors = async (filePath: string) => {
        try {
          // Try to read the file and check for common error patterns
          const fileContent = await webcontainer.fs.readFile(filePath, 'utf-8');
          
          // Basic TypeScript error detection (this could be enhanced)
          const errorPatterns = [
            /Property '(\w+)' does not exist on type/g,
            /Cannot find name '(\w+)'/g,
            /Type '(\w+)' is not assignable to type '(\w+)'/g,
            /Expected (\d+) arguments, but got (\d+)/g,
            /Argument of type '(\w+)' is not assignable to parameter of type '(\w+)'/g
          ];

          let lineNumber = 1;
          const lines = fileContent.split('\n');
          
          for (const line of lines) {
            for (const pattern of errorPatterns) {
              const match = pattern.exec(line);
              if (match) {
                const errorId = `${filePath}-${lineNumber}-${Date.now()}`;
                const newError = {
                  id: errorId,
                  file: filePath,
                  line: lineNumber,
                  message: match[0],
                  timestamp: Date.now(),
                  isFixed: false
                };

                // Add error to state
                setErrorFeedbackState(prev => ({
                  ...prev,
                  errors: [...prev.errors.filter(e => e.id !== errorId), newError]
                }));

                console.log(`🚨 Detected potential error in ${filePath}:${lineNumber} - ${match[0]}`);
                
                // Auto-send for fixing if error feedback is active
                if (errorFeedbackState.isActive) {
                  await sendErrorForFix(newError);
                }
              }
            }
            lineNumber++;
          }
        } catch (error) {
          console.log(`ℹ️ Could not check errors for ${filePath}:`, error);
        }
      };

      // Monitor TypeScript/React files
      for (const file of filesRef.current) {
        if (file.type === 'file' && (file.path.endsWith('.ts') || file.path.endsWith('.tsx') || file.path.endsWith('.js') || file.path.endsWith('.jsx'))) {
          await checkErrors(file.path);
        }
      }

    } catch (error) {
      console.error('❌ Error monitoring failed:', error);
    }
  };

  // Monitor dev server output for runtime/compilation errors
  const monitorDevServerErrors = (output: string) => {
    const errorPatterns = [
      // TypeScript errors
      /ERROR in (.*?):(\d+):(\d+)\s+TS\d+:\s+(.*)/g,
      // Webpack compilation errors
      /Module not found: Error: Can't resolve '(.*?)' in '(.*?)'/g,
      // React errors
      /Error: (.*?) is not defined/g,
      // Vite errors
      /\[vite\] Internal server error: (.*)/g,
      // ESLint errors
      /error\s+(.*?)\s+\((.*?):(\d+):(\d+)\)/g
    ];

    let match;
    for (const pattern of errorPatterns) {
      while ((match = pattern.exec(output)) !== null) {
        const errorId = `runtime-${Date.now()}-${Math.random()}`;
        const newError = {
          id: errorId,
          file: match[1] || match[2] || 'Unknown file',
          line: parseInt(match[2] || match[3] || '0'),
          column: parseInt(match[3] || match[4] || '0'),
          message: match[4] || match[1] || match[0],
          timestamp: Date.now(),
          isFixed: false
        };

        console.log(`🚨 Runtime error detected: ${newError.message}`);
        
        setErrorFeedbackState(prev => ({
          ...prev,
          errors: [...prev.errors.filter(e => e.id !== errorId), newError]
        }));

        // Auto-send for fixing if error feedback is active
        if (errorFeedbackState.isActive) {
          sendErrorForFix(newError);
        }
      }
    }
  };

  // Simplified package installation state (background only, no UI)
  const [isPreviewReady, setIsPreviewReady] = useState(false);

  // Smart package installation during streaming
  const handlePackageInstallationCoordinated = async (filePath: string) => {
    try {
      // Only handle package.json files
      if (!filePath.endsWith('package.json')) {
        return;
      }

      console.log(`📦 Detected package.json: ${filePath}`);
      
      // Get the directory where package.json is located
      const packageDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
      
      // Check if installation is already in progress or completed for this directory
      const currentStatus = packageInstallationStatusRef.current.get(packageDir);
      if (currentStatus === 'installing' || currentStatus === 'completed') {
        console.log(`📦 Package installation for ${packageDir} already ${currentStatus}, skipping...`);
        return;
      }

      // Debounce package installation to prevent rapid multiple installs
      const existingTimer = packageInstallDebounceRef.current.get(packageDir);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set a debounce timer to delay installation by 1 second
      const debounceTimer = setTimeout(async () => {
        packageInstallDebounceRef.current.delete(packageDir);
        await executePackageInstallation(packageDir);
      }, 1000);

      packageInstallDebounceRef.current.set(packageDir, debounceTimer);
      console.log(`⏳ Debouncing package installation for ${packageDir} (1s delay)...`);
    } catch (error) {
      console.error('❌ Coordinated package installation error:', error);
    }
  };

  // Execute actual package installation with coordination
  const executePackageInstallation = async (packageDir: string) => {
    try {
      // Await the webcontainer promise directly
      const wc = await webcontainerPromise;
      if (!wc) {
        console.error('❌ WebContainer not available for package installation');
        return;
      }

      // Check if there's already a lock for this package directory
      const existingLock = packageInstallLocksRef.current.get(packageDir);
      if (existingLock) {
        console.log(`📦 Package installation already in progress for ${packageDir}, waiting...`);
        await existingLock;
        return;
      }

      // Set status to installing
      packageInstallationStatusRef.current.set(packageDir, 'installing');
      
      // Create installation promise
      const installationPromise = (async () => {
        try {
          console.log(`📦 Starting npm install for ${packageDir}...`);
          
          // Install packages using npm with optimized settings
          const installProcess = await wc.spawn('npm', ['install'], {
            cwd: packageDir,
            env: { 
              npm_config_yes: 'true',
              npm_config_fund: 'false',
              npm_config_audit: 'false',
              npm_config_progress: 'false' // Reduce log noise
            }
          });

          // Stream the installation output (background only)
          installProcess.output.pipeTo(new WritableStream({
            write(data: any) {
              try {
                let output: string;
                if (typeof data === 'string') {
                  output = data;
                } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
                  output = new TextDecoder().decode(data);
                } else {
                  output = String(data);
                }
                console.log(`📦 npm install (${packageDir}):`, output);
              } catch (error) {
                console.error('Error decoding npm install output:', error);
              }
            }
          }));

          const exitCode = await installProcess.exit;
          if (exitCode === 0) {
            console.log(`✅ Package installation completed for ${packageDir}`);
            packageInstallationStatusRef.current.set(packageDir, 'completed');
            
            // After successful installation, try to start the preview with coordination
            await startPreviewAfterPackagesCoordinated(packageDir);
          } else {
            console.error(`❌ Package installation failed for ${packageDir} (exit code: ${exitCode})`);
            packageInstallationStatusRef.current.set(packageDir, 'failed');
          }
        } catch (error) {
          console.error(`❌ Package installation error for ${packageDir}:`, error);
          packageInstallationStatusRef.current.set(packageDir, 'failed');
        }
      })();

      // Store the lock
      packageInstallLocksRef.current.set(packageDir, installationPromise);
      
      // Wait for installation to complete
      await installationPromise;
      
      // Clean up the lock
      packageInstallLocksRef.current.delete(packageDir);
    } catch (error) {
      console.error('❌ Package installation execution error:', error);
    }
  };

  // Start preview after packages are ready with coordination to prevent multiple spawns
  const startPreviewAfterPackagesCoordinated = async (packageDir: string = '.') => {
    try {
      // Check if dev server already spawned for this directory
      if (devServerSpawnedRef.current.has(packageDir)) {
        console.log(`🚀 Dev server already spawned for ${packageDir}, skipping...`);
        return;
      }

      // Await the webcontainer promise directly
      const wc = await webcontainerPromise;
      if (!wc) {
        console.error('❌ WebContainer not available for starting preview');
        return;
      }

      console.log(`🚀 Starting coordinated preview for ${packageDir}...`);

      // Check if there's a dev script in package.json
      try {
        const packageJsonPath = packageDir === '.' ? 'package.json' : `${packageDir}/package.json`;
        console.log(`📋 Checking for package.json at: ${packageJsonPath}`);
        
        const packageJsonContent = await wc.fs.readFile(packageJsonPath, 'utf-8');
        const packageData = JSON.parse(packageJsonContent);
        
        if (packageData.scripts?.dev) {
          console.log(`🎯 Found dev script in ${packageJsonPath}`);
          
          // Mark this directory as having a spawned dev server
          devServerSpawnedRef.current.add(packageDir);
          
          // Clean up any existing dev servers first (but keep track of this one)
          await cleanupDevServerProcesses();
          
          // Start the dev server
          const devProcess = await wc.spawn('npm', ['run', 'dev'], {
            cwd: packageDir
          });
          
          // Track this process for cleanup
          runningProcessesRef.current.push(devProcess);
          console.log(`📋 Tracking dev server process for ${packageDir}`);

          // Stream dev server output (background only)
          devProcess.output.pipeTo(new WritableStream({
            write(data: any) {
              try {
                let output: string;
                if (typeof data === 'string') {
                  output = data;
                } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
                  output = new TextDecoder().decode(data);
                } else {
                  output = String(data);
                }
                console.log(`🚀 dev server (${packageDir}):`, output);
              } catch (error) {
                console.error('Error decoding dev server output:', error);
              }
            }
          }));

          console.log(`✅ Development server started for ${packageDir}`);
          setIsPreviewReady(true);
        } else {
          console.log(`⚠️ No dev script found in ${packageJsonPath}`);
        }
      } catch (error) {
        console.error(`❌ Error reading ${packageDir === '.' ? 'package.json' : packageDir + '/package.json'} or starting dev server:`, error);
        // Remove from spawned set on error
        devServerSpawnedRef.current.delete(packageDir);
      }
    } catch (error) {
      console.error('❌ Coordinated preview startup error:', error);
      // Remove from spawned set on error
      devServerSpawnedRef.current.delete(packageDir);
    }
  };

  const saveFileToWebcontainer = async (filePath: string, content: string) => {
    try {
      // Implement coordinated file writing to prevent race conditions
      const existingWrite = fileWriteQueueRef.current.get(filePath);
      if (existingWrite) {
        console.log(`⏳ File write already in progress for ${filePath}, waiting...`);
        await existingWrite;
        return; // File already written
      }

      // Create a promise for this file write operation
      const writePromise = (async () => {
        // Await the webcontainer promise directly for strict sequencing
        const wc = await webcontainerPromise;
        if (!wc) {
          console.error('❌ WebContainer not available');
          return;
        }
        
        console.log(`💾 Saving file to webcontainer: ${filePath}`);
        
        // Ensure directory structure exists
        const parts = filePath.split('/');
        const dirPath = parts.slice(0, -1).join('/');
            
        if (dirPath) {
          await wc.fs.mkdir(dirPath, { recursive: true });
        }
        
        // Write the file
        await wc.fs.writeFile(filePath, content);
        console.log(`✅ File saved: ${filePath}`);

        // Check if this is a package file and handle installation with coordination
        await handlePackageInstallationCoordinated(filePath);
      })();

      // Track the write promise
      fileWriteQueueRef.current.set(filePath, writePromise);
      
      // Execute the write
      await writePromise;
      
      // Clean up the promise from queue
      fileWriteQueueRef.current.delete(filePath);
    } catch (error) {
      console.error(`❌ Error saving file ${filePath}:`, error);
      // Clean up on error
      fileWriteQueueRef.current.delete(filePath);
    }
  };

  // Enhanced package detection and automatic development workflow
  const checkForDevelopmentWorkflow = async () => {
    try {
      // Await the webcontainer promise directly
      const wc = await webcontainerPromise;
      if (!wc) {
        console.warn('❌ WebContainer not available for development workflow check');
        return;
      }

      // Check for package.json files in priority order for fullstack projects
      const packageJsonChecks = [
        { path: 'frontend/package.json', name: 'frontend', workingDir: 'frontend' },
        { path: 'package.json', name: 'main', workingDir: '.' },
        { path: 'backend/package.json', name: 'backend', workingDir: 'backend' }
      ];

      for (const check of packageJsonChecks) {
        try {
          const packageJsonContent = await wc.fs.readFile(check.path, 'utf-8');
          const packageData = JSON.parse(packageJsonContent);
          
          console.log(`📋 Found ${check.name} package.json at: ${check.path}`);
          console.log(`📋 Available scripts: ${Object.keys(packageData.scripts || {}).join(', ')}`);
          
          // For frontend/main package.json, start preview if dev script exists
          if ((check.name === 'frontend' || check.name === 'main') && packageData.scripts?.dev && !isPreviewReady) {
            console.log(`🎯 Found ${check.name} dev script, starting coordinated preview...`);
            await startPreviewAfterPackagesCoordinated(check.workingDir);
            break; // Only start one preview
          }
          // For backend package.json, just log (could start backend dev server if needed)
          else if (check.name === 'backend' && packageData.scripts?.dev) {
            console.log('🎯 Found backend dev script');
            // Could start backend dev server here if needed
          }
        } catch (error) {
          console.log(`ℹ️ No ${check.name} package.json found at ${check.path}`);
        }
      }
    } catch (error) {
      console.error('❌ Error checking development workflow:', error);
    }
  };

  // Add function to handle streaming steps with immediate file saving
  const handleStreamingStep = async (step: Step) => {
    // Add step to the steps array
    setSteps(prevSteps => [...prevSteps, { ...step, status: 'pending' }]);
    
    // If it's a file creation step, immediately save to webcontainer and update files
    if (step.type === StepType.CreateFile && step.path && step.code) {
      // Increment pending operations counter (ref)
      incrementPendingFileOperations();
      
      try {
        // Enhanced fullstack project detection - only if there are BOTH frontend and backend indicators
        let finalPath = step.path;
        
        // Check if we already have files indicating fullstack structure
        const hasExplicitStructure = filesRef.current.some(f => 
          f.path.startsWith('frontend/') || f.path.startsWith('backend/')
        );
        
        // Check if current step has explicit fullstack paths
        const hasExplicitPaths = step.path.startsWith('frontend/') || step.path.startsWith('backend/');
        
        // Detect fullstack project more conservatively
        const isFullstackProject = hasExplicitStructure || hasExplicitPaths || (
          // Only consider fullstack if we have indicators of BOTH frontend AND backend
          step.code && (
            (step.code.includes('express') && step.code.includes('cors')) || // Clear backend indicators
            (step.code.includes('react') && step.code.includes('express')) || // Both in same file
            (step.path.includes('frontend/') || step.path.includes('backend/')) // Explicit paths
          )
        );
        
        console.log(`🔍 Analyzing file: ${step.path}`);
        console.log(`📊 hasExplicitStructure: ${hasExplicitStructure}, hasExplicitPaths: ${hasExplicitPaths}, isFullstackProject: ${isFullstackProject}`);
        
        // Smart path routing for fullstack projects
        if (isFullstackProject) {
          // If path already includes frontend/ or backend/, keep as-is
          if (step.path.startsWith('frontend/') || step.path.startsWith('backend/')) {
            finalPath = step.path;
            console.log(`📁 Path already structured: ${finalPath}`);
          }
          // Route files to appropriate directories based on content and type
          else if (step.path === 'package.json') {
            // Analyze package.json content to determine if it's frontend or backend
            if (step.code.includes('react') || step.code.includes('vite') || step.code.includes('"dev"')) {
              finalPath = 'frontend/package.json';
              console.log(`📝 Moving React/Vite package.json to ${finalPath}`);
            } else if (step.code.includes('express') || step.code.includes('"node-starter"') || step.code.includes('"test"')) {
              finalPath = 'backend/package.json';
              console.log(`📝 Moving Node.js package.json to ${finalPath}`);
            }
          }
          // Route source files
          else if (step.path.startsWith('src/')) {
            // Check content to determine if it's frontend or backend
            if (step.code.includes('React') || step.code.includes('JSX') || step.code.includes('tsx') || step.code.includes('useState')) {
              finalPath = `frontend/${step.path}`;
              console.log(`📝 Moving React component to ${finalPath}`);
            } else if (step.code.includes('express') || step.code.includes('require(') || step.code.includes('app.listen')) {
              finalPath = `backend/${step.path}`;
              console.log(`📝 Moving Node.js file to ${finalPath}`);
            }
          }
          // Route config files
          else if (step.path.includes('vite.config') || step.path.includes('tailwind.config') || step.path === 'index.html') {
            finalPath = `frontend/${step.path}`;
            console.log(`📝 Moving frontend config to ${finalPath}`);
          }
          // Route other common files
          else if (step.path.includes('.ts') || step.path.includes('.js')) {
            // Default backend for .ts/.js files if no clear React indicators
            if (!step.code.includes('React') && !step.code.includes('JSX')) {
              finalPath = `backend/${step.path}`;
              console.log(`📝 Moving server file to ${finalPath}`);
            }
          }
        }
        // Single project structure - keep files in root
        else {
          console.log(`📄 Single project detected - keeping files in root structure`);
          // Only move obvious backend files to avoid conflicts
          if (step.path === 'package.json' && step.code && step.code.length < 200 && step.code.includes('"test"') && !step.code.includes('"dev"') && !step.code.includes('"build"')) {
            finalPath = 'backend/package.json';
            console.log(`📝 Moving minimal Node.js package.json to ${finalPath} to avoid conflict`);
          }
        }
        
        // Save to webcontainer immediately
        await saveFileToWebcontainer(finalPath, step.code);
        
        // Update the files state
        setFiles(prevFiles => {
          const newFiles = [...prevFiles];
          const pathParts = finalPath.split('/').filter(p => p.length > 0);
          
          // Build the file structure
          let currentFileStructure = newFiles;
          let currentPath = "";
          
          // Navigate/create folders
          for (let i = 0; i < pathParts.length - 1; i++) {
            const folderName = pathParts[i];
            currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
            
            let folder = currentFileStructure.find(x => x.path === currentPath && x.type === 'folder');
            if (!folder) {
              folder = {
                name: folderName,
                type: 'folder',
                path: currentPath,
                children: []
              };
              currentFileStructure.push(folder);
            }
            currentFileStructure = folder.children!;
          }
          
          // Create or update the file
          const fileName = pathParts[pathParts.length - 1];
          const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
          
          let file = currentFileStructure.find(x => x.path === filePath);
          const fileObj = {
            name: fileName,
            type: 'file' as const,
            path: filePath,
            content: step.code || ''
          };
          
          if (!file) {
            currentFileStructure.push(fileObj);
            console.log(`✅ Created new file: ${filePath}`);
          } else {
            file.content = step.code || '';
            console.log(`✅ Updated existing file: ${filePath}`);
          }
          
          // Auto-select important files (App.tsx, main.tsx, etc.)
          if (!selectedFile && (filePath.includes('App.tsx') || filePath.includes('main.tsx') || filePath.includes('index.tsx'))) {
            setSelectedFile(fileObj);
            console.log(`🎯 Auto-selected file: ${filePath}`);
          }
          
          return newFiles;
        });
        
        // Mark step as completed
        setSteps(prevSteps => 
          prevSteps.map(s => s.id === step.id ? { ...s, status: 'completed' } : s)
        );
        
        console.log(`✅ File processing completed for: ${finalPath}`);
      } catch (error) {
        console.error(`❌ Error processing file ${step.path}:`, error);
        // Mark step as completed but log the error
        setSteps(prevSteps => 
          prevSteps.map(s => s.id === step.id ? { ...s, status: 'completed' } : s)
        );
      } finally {
        // Decrement pending operations counter (ref)
        decrementPendingFileOperations();
      }
    } else if (step.type === StepType.RunScript && step.code) {
      // Handle shell commands - process them and update package.json if needed
      console.log(`🔧 Processing shell command: ${step.code}`);
      
      try {
        await handleShellCommand(step.code);
        
        // Mark step as completed
        setSteps(prevSteps => 
          prevSteps.map(s => s.id === step.id ? { ...s, status: 'completed' } : s)
        );
        
      } catch (error) {
        console.error(`❌ Failed to process shell command:`, error);
        // Mark step as pending (could retry)
        setSteps(prevSteps => 
          prevSteps.map(s => s.id === step.id ? { ...s, status: 'pending' } : s)
        );
      }
    }
  };

  const [files,setFiles]=useState<FileItem[]>([]);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  
  // Callback refs to get current state values
  const filesRef = useRef<FileItem[]>([]);
  const stepsRef = useRef<Step[]>([]);
  const messagesRef = useRef<{role: "user" | "assistant", content: string;}[]>([]);
  
  // WebContainer coordination refs to prevent redundancies and race conditions
  const packageInstallLocksRef = useRef<Map<string, Promise<void>>>(new Map());
  const devServerSpawnedRef = useRef<Set<string>>(new Set());
  const fileWriteQueueRef = useRef<Map<string, Promise<void>>>(new Map());
  const packageInstallationStatusRef = useRef<Map<string, 'pending' | 'installing' | 'completed' | 'failed'>>(new Map());
  const packageInstallDebounceRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Update refs when state changes
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);
  
  useEffect(() => {
    messagesRef.current = llmMessages;
  }, [llmMessages]);

  // Handle preview tab activation - start dev server if needed
  useEffect(() => {
    if (activeTab === 'preview' && !isPreviewReady && files.length > 0) {
      console.log('🎯 Preview tab activated - checking for dev server...');
      
      // Check if we have any package.json files with dev script
      const packageJsonFiles = files.filter(f => f.path.endsWith('package.json'));
      if (packageJsonFiles.length > 0) {
        console.log('📦 Found package.json files, attempting to start preview...');
        checkForDevelopmentWorkflow();
      } else {
        console.log('⚠️ No package.json files found for preview');
      }
    }
  }, [activeTab, isPreviewReady, files.length]);

  useEffect(() => {
    console.log('=== useEffect triggered ===');
    console.log('Total steps:', steps.length);
    console.log('Steps:', steps.map(s => ({ id: s.id, title: s.title, status: s.status, type: s.type })));
    
    // Only process non-file steps since file steps are handled by streaming parser
    const pendingNonFileSteps = steps.filter(({status, type}) => 
      status === "pending" && type !== StepType.CreateFile
    );
    console.log('Pending non-file steps count:', pendingNonFileSteps.length);
    
    if (pendingNonFileSteps.length === 0) {
      console.log('No pending non-file steps to process, exiting useEffect');
      return;
    }

    console.log('Processing pending non-file steps:', pendingNonFileSteps.map(s => ({ id: s.id, title: s.title, type: s.type })));
    
    // Mark non-file steps as completed (like folder creation, shell commands)
    setSteps(prevSteps => prevSteps.map((s: Step) => {
      const wasPendingNonFile = pendingNonFileSteps.find(ps => ps.id === s.id);
      if (wasPendingNonFile) {
        console.log('Marking non-file step as completed:', s.id, s.title);
        return { ...s, status: "completed" as "completed" };
      }
      return s;
    }));
  }, [steps]);

  // Simplified useEffect for webcontainer mounting (fallback for batch operations)
  useEffect(() => {
    // Only mount if we have files and webcontainer is ready
    // Streaming file creation handles individual files directly
    if (files.length > 0 && webcontainer) {
      console.log('📁 Mounting file structure to webcontainer (fallback)');
      
      const createMountStructure = (files: FileItem[]): Record<string, any> => {
        const mountStructure: Record<string, any> = {};
    
        const processFile = (file: FileItem, isRootFolder: boolean) => {  
          if (file.type === 'folder') {
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
              return {
                file: {
                  contents: file.content || ''
                }
              };
            }
          }
    
          return mountStructure[file.name];
        };
    
        files.forEach(file => processFile(file, true));
        return mountStructure;
      };
  
      const mountStructure = createMountStructure(files);
      console.log('Mount structure:', mountStructure);
      webcontainer.mount(mountStructure);
    }
  }, [files, webcontainer]);

  async function sendMessage(message: string) {
    console.log('User prompt:', message);
    
    // Set streaming indicator
    setIsStreaming(true);
    
    // Add user message to conversation
    const newUserMessage = { role: "user" as const, content: message };
    const updatedMessages = [...llmMessages, newUserMessage];
    setLlmMessages(updatedMessages);
    
    try {
      // STEP 1: Get AI response using fetch with streaming
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/plain', // This signals we want streaming
        },
        body: JSON.stringify({
          messages: updatedMessages,
          provider: aiProvider,
          stream: true // Explicitly request streaming
        })
      });

      if (!response.ok) {
        // If streaming fails, fallback to regular JSON response
        console.log('⚠️ Streaming failed, attempting fallback to regular JSON response...');
        const fallbackResponse = await fetch(`${BACKEND_URL}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: updatedMessages,
            provider: aiProvider,
            stream: false // Explicitly request non-streaming
          })
        });
        
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          if (data.response) {
            // Add assistant response to conversation
            const assistantMessage = { role: "assistant" as const, content: data.response };
            setLlmMessages(prev => [...prev, assistantMessage]);
            
            // Process with fallback method (all at once)
            await processResponseFallback(data.response);
          }
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is not available for streaming');
      }

      // STEP 2-8: Process the streaming response
      await processResponseStreamlined(response.body);
      
    } catch (error) {
      console.error('❌ Error in sendMessage:', error);
      
      // Fallback to regular endpoint if streaming fails
      try {
        const fallbackResponse = await fetch(`${BACKEND_URL}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: updatedMessages,
            provider: aiProvider,
            stream: false // Explicitly request non-streaming
          })
        });
        
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          if (data.response) {
            // Add assistant response to conversation
            const assistantMessage = { role: "assistant" as const, content: data.response };
            setLlmMessages(prev => [...prev, assistantMessage]);
            
            // Process with fallback method (all at once)
            await processResponseFallback(data.response);
          }
        } else {
          throw new Error('Both streaming and fallback requests failed');
        }
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
        setIsStreaming(false);
      }
    }
  }

  // Fallback processing function for non-streaming responses
  const processResponseFallback = async (aiResponse: string) => {
    try {
      // STEP 2: Check for package.json and start parallel installation
      const hasPackageJson = aiResponse.includes('package.json');
      let packageInstallPromise: Promise<void> | null = null;
      
      if (hasPackageJson) {
        console.log('📦 Package.json detected - starting parallel installation');
        packageInstallPromise = startParallelPackageInstallation(aiResponse);
      }
      
      // STEP 3: Process files immediately as they're parsed
      const maxStepId = steps.length > 0 ? Math.max(...steps.map(s => s.id || 0)) : 0;
      const streamingParser = new StreamingXMLParser(handleStreamingStepImmediate, maxStepId + 1);
      
      streamingParser.processChunk(aiResponse);
      streamingParser.finalize();
      
      // Wait for package installation to complete if it was started
      if (packageInstallPromise) {
        await packageInstallPromise;
      }
      
      // Wait for all file operations to complete before auto-saving
      console.log('⏳ Waiting for all file operations to complete...');
      let waitTime = 0;
      const maxWaitTime = 10000; // 10 seconds max wait
      while (pendingFileOperationsRef.current > 0 && waitTime < maxWaitTime) {
        console.log(`   📋 Pending file operations: ${pendingFileOperationsRef.current}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        waitTime += 500;
      }
      
      if (pendingFileOperationsRef.current > 0) {
        console.warn(`⚠️ Timeout waiting for file operations. Still pending: ${pendingFileOperationsRef.current}`);
      } else {
        console.log('✅ All file operations completed');
      }
      
      // STEP 5: Auto-save project
      console.log('💾 Auto-saving project...');
      await autoSaveProject();
      
      // STEP 6: Start preview server immediately (don't wait for error checks)
      console.log('🚀 Starting preview server...');
      await startPreviewServer();
      
      // STEP 7: Error detection in background (after preview starts)
      setTimeout(() => errorDetectionAndFixing(), 3000); // Run after 3 seconds
      
    } catch (error) {
      console.error('❌ Error in fallback processing:', error);
    } finally {
      setIsStreaming(false);
    }
  };

  // New streamlined processing function for streaming
  const processResponseStreamlined = async (responseBody: ReadableStream<Uint8Array>) => {
    try {
      // Set up variables for accumulating response data
      let fullAiResponse = '';
      let packageInstallPromise: Promise<void> | null = null;
      let hasStartedPackageInstall = false;
      
      // STEP 1: Initialize streaming parser
      const maxStepId = steps.length > 0 ? Math.max(...steps.map(s => s.id || 0)) : 0;
      const streamingParser = new StreamingXMLParser(handleStreamingStepImmediate, maxStepId + 1);
      
      // STEP 2: Process stream chunks in real-time
      const reader = responseBody.getReader();
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('✅ Stream completed');
            break;
          }
          
          // Decode the chunk
          const chunkText = decoder.decode(value, { stream: true });
          
          // Accumulate full response for package detection
          fullAiResponse += chunkText;
          
          // Process this chunk immediately with the parser
          streamingParser.processChunk(chunkText);
          
          // Check for package.json and start parallel installation (only once)
          if (!hasStartedPackageInstall && fullAiResponse.includes('package.json')) {
            console.log('📦 Package.json detected - starting parallel installation');
            hasStartedPackageInstall = true;
            packageInstallPromise = startParallelPackageInstallation(fullAiResponse);
          }
        }
      } finally {
        // Ensure reader is always released
        reader.releaseLock();
      }
      
      // STEP 3: Finalize the parser
      streamingParser.finalize();
      
      // STEP 4: Add the full assistant response to conversation
      const assistantMessage = { role: "assistant" as const, content: fullAiResponse };
      setLlmMessages(prev => [...prev, assistantMessage]);
      
      // STEP 5: Wait for package installation to complete if it was started
      if (packageInstallPromise) {
        await packageInstallPromise;
      }
      
      // STEP 6: Wait for all file operations to complete before auto-saving
      let waitTime = 0;
      const maxWaitTime = 10000; // 10 seconds max wait
      while (pendingFileOperationsRef.current > 0 && waitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 500));
        waitTime += 500;
      }
      
      if (pendingFileOperationsRef.current > 0) {
        console.warn(`⚠️ Timeout waiting for file operations. Still pending: ${pendingFileOperationsRef.current}`);
      } else {
        console.log('✅ All file operations completed');
      }
      
      // STEP 7: Auto-save project
      await autoSaveProject();
      
      // STEP 8: Start preview server immediately (don't wait for error checks)
      await startPreviewServer();
      
      // STEP 9: Error detection in background (after preview starts)
      console.log('🔍 Running error detection in background...');
      setTimeout(() => errorDetectionAndFixing(), 3000); // Run after 3 seconds
      
    } catch (error) {
      console.error('❌ Error in streaming processing:', error);
    } finally {
      setIsStreaming(false);
    }
  };

  // Helper functions for streamlined workflow
  const startParallelPackageInstallation = async (aiResponse: string): Promise<void> => {
    // Extract package.json content and start installation
    const packageJsonMatch = aiResponse.match(/<file\s+path="package\.json"[^>]*>(.*?)<\/file>/s);
    if (packageJsonMatch) {
      const packageJsonContent = packageJsonMatch[1];
      console.log('� Starting parallel package installation...');
      
      try {
        const wc = await webcontainerPromise;
        if (wc) {
          await wc.fs.writeFile('package.json', packageJsonContent);
          const installProcess = await wc.spawn('npm', ['install'], {
            env: { 
              npm_config_yes: 'true',
              npm_config_fund: 'false',
              npm_config_audit: 'false'
            }
          });
          
          installProcess.output.pipeTo(new WritableStream({
            write(data: any) {
              console.log('📦 npm install:', String(data));
            }
          }));
          
          await installProcess.exit;
          console.log('✅ Package installation completed');
        }
      } catch (error) {
        console.error('❌ Package installation failed:', error);
      }
    }
  };

  const handleStreamingStepImmediate = async (step: Step) => {
    // Immediate processing with status tracking
    console.log(`📁 Processing step immediately: ${step.title} (${step.type})`);
    
    if (step.type === StepType.CreateFile && step.path && step.code) {
      // Add step as in-progress immediately
      setSteps(prev => [...prev, { ...step, status: 'in-progress' }]);
      
      // Increment pending operations counter
      incrementPendingFileOperations();
      
      try {
        // Enhanced fullstack project detection - only if there are BOTH frontend and backend indicators
        let finalPath = step.path;
        
        // Check if we already have files indicating fullstack structure
        const hasExplicitStructure = filesRef.current.some(f => 
          f.path.startsWith('frontend/') || f.path.startsWith('backend/')
        );
        
        // Check if current step has explicit fullstack paths
        const hasExplicitPaths = step.path.startsWith('frontend/') || step.path.startsWith('backend/');
        
        // Detect fullstack project more conservatively
        const isFullstackProject = hasExplicitStructure || hasExplicitPaths || (
          // Only consider fullstack if we have indicators of BOTH frontend AND backend
          step.code && (
            (step.code.includes('express') && step.code.includes('cors')) || // Clear backend indicators
            (step.code.includes('react') && step.code.includes('express')) || // Both in same file
            (step.path.includes('frontend/') || step.path.includes('backend/')) // Explicit paths
          )
        );
        
        console.log(`🔍 Analyzing file: ${step.path}`);
        console.log(`📊 hasExplicitStructure: ${hasExplicitStructure}, hasExplicitPaths: ${hasExplicitPaths}, isFullstackProject: ${isFullstackProject}`);
        
        // Smart path routing for fullstack projects
        if (isFullstackProject) {
          // If path already includes frontend/ or backend/, keep as-is
          if (step.path.startsWith('frontend/') || step.path.startsWith('backend/')) {
            finalPath = step.path;
            console.log(`📁 Path already structured: ${finalPath}`);
          }
          // Route files to appropriate directories based on content and type
          else if (step.path === 'package.json') {
            // Analyze package.json content to determine if it's frontend or backend
            if (step.code.includes('react') || step.code.includes('vite') || step.code.includes('"dev"')) {
              finalPath = 'frontend/package.json';
              console.log(`📝 Moving React/Vite package.json to ${finalPath}`);
            } else if (step.code.includes('express') || step.code.includes('"node-starter"') || step.code.includes('"test"')) {
              finalPath = 'backend/package.json';
              console.log(`📝 Moving Node.js package.json to ${finalPath}`);
            }
          }
          // Route source files
          else if (step.path.startsWith('src/')) {
            // Check content to determine if it's frontend or backend
            if (step.code.includes('React') || step.code.includes('JSX') || step.code.includes('tsx') || step.code.includes('useState')) {
              finalPath = `frontend/${step.path}`;
              console.log(`📝 Moving React component to ${finalPath}`);
            } else if (step.code.includes('express') || step.code.includes('require(') || step.code.includes('app.listen')) {
              finalPath = `backend/${step.path}`;
              console.log(`📝 Moving Node.js file to ${finalPath}`);
            }
          }
          // Route config files
          else if (step.path.includes('vite.config') || step.path.includes('tailwind.config') || step.path === 'index.html') {
            finalPath = `frontend/${step.path}`;
            console.log(`📝 Moving frontend config to ${finalPath}`);
          }
          // Route other common files
          else if (step.path.includes('.ts') || step.path.includes('.js')) {
            // Default backend for .ts/.js files if no clear React indicators
            if (!step.code.includes('React') && !step.code.includes('JSX')) {
              finalPath = `backend/${step.path}`;
              console.log(`📝 Moving server file to ${finalPath}`);
            }
          }
        }
        // Single project structure - keep files in root
        else {
          console.log(`📄 Single project detected - keeping files in root structure`);
          // Only move obvious backend files to avoid conflicts
          if (step.path === 'package.json' && step.code && step.code.length < 200 && step.code.includes('"test"') && !step.code.includes('"dev"') && !step.code.includes('"build"')) {
            finalPath = 'backend/package.json';
            console.log(`📝 Moving minimal Node.js package.json to ${finalPath} to avoid conflict`);
          }
        }
        
        await saveFileToWebcontainer(finalPath, step.code);
        
        // Update file tree with the final path
        updateFileTree(finalPath, step.code);
        
        // Mark step as completed
        setSteps(prev => prev.map(s => 
          s.id === step.id ? { ...s, status: 'completed' } : s
        ));
        
        console.log(`✅ Processed file immediately: ${step.path} -> ${finalPath}`);
        
      } catch (error) {
        console.error(`❌ Failed to process file ${step.path}:`, error);
        // Mark step as failed but show as completed in UI (with error logged)
        setSteps(prev => prev.map(s => 
          s.id === step.id ? { ...s, status: 'completed' } : s
        ));
      } finally {
        // Decrement pending operations counter
        decrementPendingFileOperations();
      }
    } else if (step.type === StepType.RunScript && step.code) {
      // Handle shell commands - process them and update package.json if needed
      console.log(`🔧 Processing shell command: ${step.code}`);
      
      // Add step as in-progress
      setSteps(prev => [...prev, { ...step, status: 'in-progress' }]);
      
      try {
        await handleShellCommand(step.code);
        
        // Mark step as completed
        setSteps(prev => prev.map(s => 
          s.id === step.id ? { ...s, status: 'completed' } : s
        ));
        
      } catch (error) {
        console.error(`❌ Failed to process shell command:`, error);
        // Mark step as pending (could retry)
        setSteps(prev => prev.map(s => 
          s.id === step.id ? { ...s, status: 'pending' } : s
        ));
      }
    }
  };

  // Handle shell commands and update package.json when needed
  const handleShellCommand = async (command: string) => {
    console.log(`🔧 Analyzing shell command: ${command}`);
    
    const wc = await webcontainerPromise;
    if (!wc) {
      console.error('❌ WebContainer not available for shell command');
      return;
    }

    // Parse and analyze the shell command
    const trimmedCommand = command.trim();
    
    // Detect npm install commands
    const npmInstallRegex = /npm\s+install\s+(.+)/;
    const npmAddRegex = /npm\s+add\s+(.+)/;
    const yarnAddRegex = /yarn\s+add\s+(.+)/;
    const bunAddRegex = /bun\s+add\s+(.+)/;
    
    let packagesToInstall: string[] = [];
    let isDev = false;
    
    if (npmInstallRegex.test(trimmedCommand)) {
      const match = trimmedCommand.match(npmInstallRegex);
      if (match) {
        const packages = match[1].split(' ').filter(p => p && !p.startsWith('-'));
        packagesToInstall = packages;
        isDev = trimmedCommand.includes('--save-dev') || trimmedCommand.includes('-D');
      }
    } else if (npmAddRegex.test(trimmedCommand) || yarnAddRegex.test(trimmedCommand) || bunAddRegex.test(trimmedCommand)) {
      const match = trimmedCommand.match(/(npm|yarn|bun)\s+add\s+(.+)/);
      if (match) {
        const packages = match[2].split(' ').filter(p => p && !p.startsWith('-'));
        packagesToInstall = packages;
        isDev = trimmedCommand.includes('--dev') || trimmedCommand.includes('-D');
      }
    }
    
    // If packages were detected, update package.json
    if (packagesToInstall.length > 0) {
      console.log(`📦 Detected package installation: ${packagesToInstall.join(', ')} ${isDev ? '(dev)' : '(production)'}`);
      
      try {
        // Enhanced package.json detection for fullstack projects
        const packageJsonPaths = [
          'frontend/package.json', // Check frontend first (most common for React/Vite)
          'backend/package.json',  // Then backend
          'package.json'          // Finally root level
        ];
        let packageJsonPath = '';
        let packageJsonContent = '';
        
        // Try to find existing package.json, prioritizing frontend for React packages
        for (const path of packageJsonPaths) {
          try {
            const content = await wc.fs.readFile(path, 'utf-8');
            const parsed = JSON.parse(content);
            
            // For React/frontend packages, prefer frontend/package.json
            if (packagesToInstall.some(pkg => pkg.includes('react') || pkg.includes('vite') || pkg.includes('@types/react'))) {
              if (path.includes('frontend') || (parsed.dependencies && (parsed.dependencies.react || parsed.dependencies.vite))) {
                packageJsonContent = content;
                packageJsonPath = path;
                console.log(`📄 Found frontend package.json at: ${path} for React packages`);
                break;
              }
            }
            // For Node.js/backend packages, prefer backend/package.json
            else if (packagesToInstall.some(pkg => pkg.includes('express') || pkg.includes('@types/node') || pkg.includes('cors'))) {
              if (path.includes('backend') || (parsed.dependencies && (parsed.dependencies.express || parsed.dependencies.cors))) {
                packageJsonContent = content;
                packageJsonPath = path;
                console.log(`📄 Found backend package.json at: ${path} for Node packages`);
                break;
              }
            }
            // Use first found package.json as fallback
            else if (!packageJsonContent) {
              packageJsonContent = content;
              packageJsonPath = path;
              console.log(`📄 Found package.json at: ${path} (fallback)`);
            }
          } catch {
            // Continue trying other paths
          }
        }
        
        // If no specific match, use the first found or create new one
        if (!packageJsonPath && packageJsonContent) {
          packageJsonPath = packageJsonPaths[0]; // Default to frontend
        } else if (!packageJsonPath) {
          // Determine where to create package.json based on package types
          if (packagesToInstall.some(pkg => pkg.includes('react') || pkg.includes('vite'))) {
            packageJsonPath = 'frontend/package.json';
            console.log('📄 Creating new frontend package.json for React packages');
          } else if (packagesToInstall.some(pkg => pkg.includes('express') || pkg.includes('@types/node'))) {
            packageJsonPath = 'backend/package.json';
            console.log('📄 Creating new backend package.json for Node packages');
          } else {
            packageJsonPath = 'package.json';
            console.log('📄 Creating new root package.json');
          }
        }
        
        // Parse the package.json
        let packageJson: any = {};
        if (packageJsonContent) {
          packageJson = JSON.parse(packageJsonContent);
        } else {
          // Create a basic package.json if none exists
          packageJson = {
            name: 'project',
            version: '1.0.0',
            description: '',
            main: 'index.js',
            scripts: {
              test: 'echo "Error: no test specified" && exit 1'
            },
            dependencies: {},
            devDependencies: {}
          };
          console.log('📄 Creating new package.json');
        }
        
        // Ensure dependencies sections exist
        if (!packageJson.dependencies) packageJson.dependencies = {};
        if (!packageJson.devDependencies) packageJson.devDependencies = {};
        
        // Add packages to the appropriate section
        const targetSection = isDev ? packageJson.devDependencies : packageJson.dependencies;
        
        for (const pkg of packagesToInstall) {
          // Handle versioned packages (e.g., "react@18.0.0")
          const [packageName, version] = pkg.includes('@') && !pkg.startsWith('@') 
            ? pkg.split('@') 
            : [pkg, 'latest'];
          const packageVersion = version || 'latest';
          
          // Use ^ prefix for semantic versioning unless exact version specified
          const finalVersion = version && version !== 'latest' && !version.startsWith('^') && !version.startsWith('~') 
            ? `^${version}` 
            : packageVersion;
          
          targetSection[packageName] = finalVersion;
          console.log(`✅ Added ${packageName}@${finalVersion} to ${isDev ? 'devDependencies' : 'dependencies'}`);
        }
        
        // Write updated package.json back to WebContainer
        const updatedPackageJson = JSON.stringify(packageJson, null, 2);
        await wc.fs.writeFile(packageJsonPath, updatedPackageJson);
        
        console.log(`📝 Writing updated package.json to: ${packageJsonPath}`);
        console.log(`📄 Content length: ${updatedPackageJson.length} characters`);
        
        // Update the file tree UI
        updateFileTree(packageJsonPath, updatedPackageJson);
        
        console.log(`✅ Updated ${packageJsonPath} with new dependencies`);
        
        // Verify the file tree was updated
        setTimeout(() => {
          const foundFile = filesRef.current.find(f => f.path === packageJsonPath);
          if (foundFile) {
            console.log(`✅ Verified package.json in file tree: ${foundFile.path} (${foundFile.content?.length} chars)`);
          } else {
            console.warn(`⚠️ package.json not found in file tree after update: ${packageJsonPath}`);
          }
        }, 1000);
        
        // Trigger coordinated package installation system
        console.log(`🔄 Triggering coordinated package installation for ${packageJsonPath}...`);
        const workingDir = packageJsonPath.includes('/') ? packageJsonPath.split('/')[0] : '.';
        console.log(`📁 Working directory: ${workingDir}`);
        
        // Use the coordinated installation system to prevent race conditions
        await handlePackageInstallationCoordinated(packageJsonPath);
        console.log('✅ Coordinated package installation completed');
        
      } catch (error) {
        console.error('❌ Failed to update package.json:', error);
      }
    } else {
      // For non-package commands, just log them (could execute if needed)
      console.log(`ℹ️ Shell command detected (not package related): ${trimmedCommand}`);
      // Could execute other shell commands here if needed
      // await wc.spawn('sh', ['-c', trimmedCommand]);
    }
  };

  const updateFileTree = (filePath: string, content: string) => {
    // Add file to the hierarchical file structure
    setFiles(prevFiles => {
      const newFiles = [...prevFiles];
      const pathParts = filePath.split('/').filter(p => p.length > 0);
      let currentLevel = newFiles;
      
      // Create folder structure if needed
      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderName = pathParts[i];
        let folder = currentLevel.find(f => f.name === folderName && f.type === 'folder');
        
        if (!folder) {
          folder = {
            name: folderName,
            type: 'folder',
            path: pathParts.slice(0, i + 1).join('/'),
            children: []
          };
          currentLevel.push(folder);
        }
        currentLevel = folder.children!;
      }
      
      // Add the file
      const fileName = pathParts[pathParts.length - 1];
      const existingFileIndex = currentLevel.findIndex(f => f.name === fileName && f.type === 'file');
      
      const fileItem: FileItem = {
        name: fileName,
        type: 'file',
        path: filePath,
        content: content
      };
      
      if (existingFileIndex >= 0) {
        currentLevel[existingFileIndex] = fileItem;
      } else {
        currentLevel.push(fileItem);
      }
      
      return newFiles;
    });
  };

  const autoSaveProject = async () => {
    try {
      console.log('💾 Auto-saving project...');
      console.log('🔍 Auto-save context:');
      console.log('  - Project ID:', projectId);
      console.log('  - Project Name:', projectName);
      console.log('  - Initial Prompt:', initialPrompt);
      console.log('  - Files count:', filesRef.current.length);
      console.log('  - Steps count:', stepsRef.current.length);
      console.log('  - Messages count:', messagesRef.current.length);
      
      // Debug: Log all files to see package.json files
      console.log('📋 Current files in filesRef:');
      filesRef.current.forEach((file, index) => {
        console.log(`  ${index}: ${file.path} (type: ${file.type}, content: ${file.content?.length || 0} chars)`);
        if (file.path.includes('package.json')) {
          console.log(`  🔍 Found package.json: ${file.path}`);
          console.log(`  📄 Content preview: ${file.content?.substring(0, 200)}...`);
        }
      });
      
      // Check if there's anything to save
      if (filesRef.current.length === 0 && stepsRef.current.length === 0) {
        console.log('⚠️ No files or steps to save yet, skipping auto-save');
        return;
      }
      
      if (projectId && projectName) {
        console.log('📝 Updating existing project...');
      } else {
        console.log('🆕 Creating new project...');
      }
      
      await saveProject(); // saveProject handles both create and update
      console.log('✅ Project auto-saved successfully');
    } catch (error) {
      console.error('❌ Auto-save failed:', error);
    }
  };

  const errorDetectionAndFixing = async (isRecheck = false) => {
    console.log(`🔍 ${isRecheck ? 'Re-checking' : 'Checking'} for errors...`);
    
    // Reset fix attempts if this is a fresh check (not a re-check)
    if (!isRecheck) {
      setErrorFeedbackState(prev => ({ 
        ...prev, 
        fixAttempts: 0 
      }));
    }
    
    try {
      const wc = await webcontainerPromise;
      if (!wc) return;
      
      const errors: string[] = [];
      
      // Check for package.json - try multiple locations for fullstack projects
      let packageJsonFound = false;
      let packageData: any = null;
      let packageJsonPath = '';
      
      const packageJsonPaths = [
        'package.json',        // Root level (single project)
        'frontend/package.json', // Frontend in fullstack
        'backend/package.json'   // Backend in fullstack
      ];
      
      for (const path of packageJsonPaths) {
        try {
          const packageJson = await wc.fs.readFile(path, 'utf-8');
          packageData = JSON.parse(packageJson);
          packageJsonPath = path;
          packageJsonFound = true;
          console.log(`✅ Found valid package.json at: ${path}`);
          break; // Use the first valid package.json found
        } catch {
          // Continue to next path
        }
      }
      
      if (packageJsonFound && packageData) {
        // Check for build script and try to run a quick type check
        if (packageData.scripts?.build || packageData.scripts?.['type-check']) {
          console.log(`🔍 Running build check for compilation errors using package.json at: ${packageJsonPath}...`);
          
          // Set working directory based on package.json location
          const workingDir = packageJsonPath.includes('/') ? packageJsonPath.split('/')[0] : '.';
          
          // Try to run build command to check for errors
          const buildScript = packageData.scripts.build || packageData.scripts['type-check'];
          if (buildScript.includes('tsc') || buildScript.includes('vite build')) {
            try {
              const buildProcess = await wc.spawn('npm', ['run', 'build'], {
                env: { NODE_ENV: 'production' },
                cwd: workingDir
              });
              
              let buildOutput = '';
              buildProcess.output.pipeTo(new WritableStream({
                write(data: any) {
                  const output = String(data);
                  buildOutput += output;
                  console.log('🔧 Build output:', output);
                }
              }));
              
              const exitCode = await buildProcess.exit;
              
              if (exitCode !== 0) {
                console.warn('⚠️ Build failed - compilation errors detected');
                
                // Parse common error patterns
                if (buildOutput.includes('TS') || buildOutput.includes('TypeScript')) {
                  errors.push('TypeScript compilation errors detected');
                }
                if (buildOutput.includes('Module not found')) {
                  errors.push('Missing module dependencies');
                }
                if (buildOutput.includes('Parse error') || buildOutput.includes('SyntaxError')) {
                  errors.push('JavaScript/TypeScript syntax errors');
                }
                
                if (errors.length === 0) {
                  errors.push('Build failed with unknown errors');
                }
              } else {
                console.log('✅ Build successful - no compilation errors');
              }
            } catch (buildError) {
              console.log('ℹ️ Could not run build check:', buildError);
              // Don't treat this as an error - maybe no build script or build tools not ready
            }
          }
        }
      } else {
        errors.push('Invalid or missing package.json in project structure');
        console.error('❌ No valid package.json found in any expected location');
      }
      
      // Check essential files based on project type
      try {
        // Try common entry points for different project structures
        const possibleEntryPoints = [
          // Root level (single project)
          'src/main.tsx',
          'src/main.ts', 
          'src/index.tsx',
          'src/index.ts',
          'src/App.tsx',
          'index.html',
          // Frontend folder (fullstack)
          'frontend/src/main.tsx',
          'frontend/src/main.ts',
          'frontend/src/index.tsx',
          'frontend/src/index.ts',
          'frontend/src/App.tsx',
          'frontend/index.html',
          // Backend folder (fullstack)
          'backend/src/index.ts',
          'backend/src/index.js',
          'backend/src/server.ts',
          'backend/src/app.ts'
        ];
        
        let hasEntryPoint = false;
        for (const entryPoint of possibleEntryPoints) {
          try {
            await wc.fs.readFile(entryPoint, 'utf-8');
            console.log(`✅ Found entry point: ${entryPoint}`);
            hasEntryPoint = true;
            break;
          } catch {
            // Continue checking other entry points
          }
        }
        
        if (!hasEntryPoint) {
          errors.push('No valid entry point found (check frontend/src/ and backend/src/ folders)');
        }
        
      } catch (error) {
        console.error('❌ Entry point check failed:', error);
      }
      
      // Report results
      if (errors.length > 0) {
        console.warn('⚠️ Errors detected:', errors);
        
        // Update error feedback state to show in UI
        setErrorFeedbackState(prev => ({
          ...prev,
          isActive: true,
          errors: errors.map((error, index) => ({
            id: `error-${Date.now()}-${index}`,
            file: 'project',
            message: error,
            timestamp: Date.now(),
            isFixed: false
          }))
        }));
        
        // STEP 8: AI error fixing loop - automatically fix detected errors
        if (errorFeedbackState.isActive && errorFeedbackState.fixAttempts < errorFeedbackState.maxFixAttempts) {
          console.log(`🤖 Starting AI error fixing loop (attempt ${errorFeedbackState.fixAttempts + 1}/${errorFeedbackState.maxFixAttempts})...`);
          
          // Increment fix attempts counter
          setErrorFeedbackState(prev => ({ 
            ...prev, 
            fixAttempts: prev.fixAttempts + 1 
          }));
          
          // Send each error to AI for automatic fixing with a delay
          for (let i = 0; i < errors.length; i++) {
            const error = errors[i];
            console.log(`🔧 Processing error ${i + 1}/${errors.length}: ${error}`);
            
            // Create error object matching the expected interface
            const errorObj = {
              file: 'project',
              message: error,
              line: undefined,
              column: undefined
            };
            
            // Send error for fixing with delay between attempts
            setTimeout(() => {
              sendErrorForFix(errorObj);
            }, i * 5000); // 5 second delay between each fix attempt
          }
        } else if (errorFeedbackState.fixAttempts >= errorFeedbackState.maxFixAttempts) {
          console.log(`⚠️ Maximum fix attempts (${errorFeedbackState.maxFixAttempts}) reached. Stopping auto-fix loop.`);
        } else {
          console.log('🤖 AI error fixing is disabled (toggle in UI to enable)');
        }
        
      } else {
        console.log('✅ No errors detected - project looks good');
        
        // Clear any existing errors and reset fix attempts
        setErrorFeedbackState(prev => ({
          ...prev,
          isActive: false,
          errors: [],
          fixAttempts: 0 // Reset attempts when no errors found
        }));
      }
      
    } catch (error) {
      console.error('❌ Error detection failed:', error);
    }
  };

  const startPreviewServer = async () => {
    console.log('🚀 Starting preview server...');
    
    try {
      const wc = await webcontainerPromise;
      if (!wc) return;
      
      // Check for package.json in proper fullstack project structure
      let packageJsonFound = false;
      let packageData: any = null;
      let workingDir = '.';
      
      const packageJsonPaths = [
        'frontend/package.json', // Check frontend first (most common for React/Vite)
        'package.json',          // Then root level
        'backend/package.json'   // Finally backend (unlikely for preview)
      ];
      
      for (const path of packageJsonPaths) {
        try {
          const packageJson = await wc.fs.readFile(path, 'utf-8');
          const parsed = JSON.parse(packageJson);
          
          // Prefer package.json with dev script for preview
          if (parsed.scripts?.dev) {
            packageData = parsed;
            workingDir = path.includes('/') ? path.split('/')[0] : '.';
            packageJsonFound = true;
            console.log(`📋 Using package.json at: ${path} for preview server`);
            console.log(`📁 Working directory: ${workingDir}`);
            break;
          }
        } catch {
          // Continue trying other paths
        }
      }
      
      if (packageJsonFound && packageData?.scripts?.dev) {
        await cleanupDevServerProcesses();
        
        const devProcess = await wc.spawn('npm', ['run', 'dev'], {
          cwd: workingDir
        });
        runningProcessesRef.current.push(devProcess);
        
        devProcess.output.pipeTo(new WritableStream({
          write(data: any) {
            console.log('🖥️ Dev server:', String(data));
          }
        }));
        
        console.log('✅ Preview server started');
      }
    } catch (error) {
      console.error('❌ Failed to start preview server:', error);
    }
  };

  async function init(prompt: string) {
    console.log('🚀 INIT FUNCTION CALLED');
    console.log('Provider:', aiProvider);
    console.log('Prompt:', prompt);
    console.log('Backend URL:', BACKEND_URL);
    
    // Reset WebContainer coordination state for fresh start
    resetWebContainerCoordinationState();
    
    // Set the current prompt for the new project
    setCurrentPrompt(prompt);
    
    // Set streaming indicator
    setIsStreaming(true);
    
    try {
      console.log('Initializing with provider:', aiProvider);
      console.log('Fetching template...');
      console.log('Making request to:', `${BACKEND_URL}/template`);
      
      // Create streaming parser for template
      const templateStreamingParser = new StreamingXMLParser(handleStreamingStep, 1);
      
      // Get the template (basic project structure)
      const response = await fetch(`${BACKEND_URL}/template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          provider: aiProvider
        }),
        signal: AbortSignal.timeout(300000) // 5 minutes (300 seconds) for template generation
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('✅ RESPONSE RECEIVED!');
      console.log('Response status:', response.status);
      console.log('Response data:', data);
      console.log('Template response received from provider:', aiProvider);
      
      const { uiprompts } = data;
      console.log('=== TEMPLATE UI PROMPTS ===');
      console.log(uiprompts[0]);
      console.log('=== END TEMPLATE UI PROMPTS ===');
      
      // Process template with streaming parser for immediate file creation
      templateStreamingParser.processChunk(uiprompts[0]);
      templateStreamingParser.finalize();
      
      // Wait for template file operations to complete (use ref to avoid stale closure)
      let waitTime = 0;
      const maxWaitTime = 20000; // 20 seconds max for template
      while (pendingFileOperationsRef.current > 0 && waitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 500));
        waitTime += 500;
      }
      
      if (pendingFileOperationsRef.current > 0) {
        console.warn(`⚠️ Timeout waiting for template operations. Still pending: ${pendingFileOperationsRef.current}`);
      } else {
        console.log('✅ All template operations completed');
      }
      
      // Package installations now happen in background, no need to wait
      console.log('📦 Package installations running in background...');
      
      // Set initial project name from the full prompt
      const cleanProjectName = prompt.trim() || 'New Project';
      setProjectName(cleanProjectName);
      
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
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          alert(`⏱️ Request timeout during initialization!\n\nThe ${aiProvider.toUpperCase()} API is taking too long to respond.\n\nSuggestions:\n1. Reload and try again\n2. Switch to ${aiProvider === 'nvidia' ? 'Claude' : 'NVIDIA'} provider`);
        } else {
          alert(`❌ Initialization Error: ${error.message}\n\nPlease reload and try again.`);
        }
      } else {
        alert(`❌ Initialization Error: Unknown error occurred\n\nPlease reload and try again.`);
      }
    } finally {
      // Clear streaming indicator
      setIsStreaming(false);
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
    <div className="h-screen bg-gradient-to-br from-background via-background-secondary to-background-tertiary flex flex-col overflow-hidden">
      {/* Header with Home Button, Streaming Indicator, and Save Button */}
      <div className="h-14 bg-black/20 backdrop-blur-sm border-b border-glass-border/20 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          {/* Home Button */}
          <button
            onClick={navigateHome}
            className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            title="Go to Home"
          >
            <Home className="w-4 h-4" />
            <span className="text-sm">Home</span>
          </button>
          
          {/* Streaming Indicator */}
          {isStreaming && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">AI is generating...</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          {/* Error Auto-Fix Toggle */}
          <button
            onClick={() => setErrorFeedbackState(prev => ({ ...prev, isActive: !prev.isActive }))}
            className={`px-3 py-2 rounded-lg border transition-colors duration-200 flex items-center gap-2 ${
              errorFeedbackState.isActive 
                ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' 
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
            title={errorFeedbackState.isActive ? "Auto-fix errors: ON" : "Auto-fix errors: OFF"}
          >
            <div className={`w-2 h-2 rounded-full ${errorFeedbackState.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm">{errorFeedbackState.isActive ? 'Auto-Fix' : 'Auto-Fix'}</span>
            {errorFeedbackState.errors.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {errorFeedbackState.errors.filter(e => !e.isFixed).length}
              </span>
            )}
          </button>
          
          {/* Reset Fix Attempts Button */}
          {errorFeedbackState.fixAttempts > 0 && (
            <button
              onClick={() => setErrorFeedbackState(prev => ({ ...prev, fixAttempts: 0 }))}
              className="px-3 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg transition-colors flex items-center gap-2"
              title={`Reset fix attempts (${errorFeedbackState.fixAttempts}/${errorFeedbackState.maxFixAttempts})`}
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-sm">Reset ({errorFeedbackState.fixAttempts})</span>
            </button>
          )}
          
          {/* Project Name */}
          {projectName && (
            <span className="text-white/70 text-sm">
              {projectName}
            </span>
          )}
          
          {/* WebContainer File Verification Button */}
          {webcontainer && (
            <button
              onClick={verifyAndResyncFiles}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors"
              title="Verify and resync files with WebContainer"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="text-sm">Verify Files</span>
            </button>
          )}
          
          {/* Dev Server Cleanup Button */}
          {webcontainer && runningProcessesRef.current.length > 0 && (
            <button
              onClick={cleanupDevServerProcesses}
              className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
              title="Stop running dev server processes"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="text-sm">Stop Servers</span>
            </button>
          )}
          
          {/* Save Button */}
          <button
            onClick={saveProject}
            disabled={isSaving}
            className="flex items-center gap-2 px-3 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save Project"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="text-sm">{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Error Feedback Display - Removed (errors only shown in console) */}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
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
                  // File saved successfully - auto-save project when file is saved
                  saveProject();
                }}
              />
            ) : (
              webcontainer ? (
                <div className="h-full">
                  <PreviewFrame webContainer={webcontainer} />
                  {!isPreviewReady && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Starting preview server...</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p>WebContainer not available</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Workspace;