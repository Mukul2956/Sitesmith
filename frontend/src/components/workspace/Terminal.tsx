import React, { useState, useRef, useEffect } from 'react';
import { Terminal, X, RotateCcw } from 'lucide-react';

interface TerminalProps {
  onClose: () => void;
  workingDirectory?: string;
}

const TerminalComponent: React.FC<TerminalProps> = ({ onClose, workingDirectory = '/' }) => {
  const [output, setOutput] = useState<string[]>([
    '$ Welcome to SiteSmith Terminal',
    '$ Type "help" for available commands',
    ''
  ]);
  const [currentInput, setCurrentInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus input when terminal opens
    inputRef.current?.focus();
    // Scroll to bottom when output changes
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const simulateCommand = async (command: string): Promise<string[]> => {
    const cmd = command.trim().toLowerCase();
    
    switch (cmd) {
      case 'help':
        return [
          'Available commands:',
          '  help     - Show this help message',
          '  ls       - List files and directories',
          '  pwd      - Show current directory',
          '  clear    - Clear terminal output',
          '  date     - Show current date and time',
          '  echo     - Echo text back',
          '  npm      - Simulate npm commands',
          '  git      - Simulate git commands',
          ''
        ];
      
      case 'ls':
        return [
          'src/',
          'public/',
          'package.json',
          'vite.config.ts',
          'tsconfig.json',
          'README.md',
          ''
        ];
      
      case 'pwd':
        return [`${workingDirectory}`, ''];
      
      case 'clear':
        setOutput([]);
        return [];
      
      case 'date':
        return [new Date().toString(), ''];
      
      default:
        if (cmd.startsWith('echo ')) {
          return [cmd.substring(5), ''];
        }
        if (cmd.startsWith('npm ')) {
          return [`Simulating: ${command}`, 'This is a demo terminal', ''];
        }
        if (cmd.startsWith('git ')) {
          return [`Simulating: ${command}`, 'This is a demo terminal', ''];
        }
        return [`Command not found: ${command}`, 'Type "help" for available commands', ''];
    }
  };

  const executeCommand = async () => {
    if (!currentInput.trim() || isRunning) return;

    setIsRunning(true);
    const command = currentInput.trim();
    
    // Add command to history
    setCommandHistory(prev => [...prev, command]);
    setHistoryIndex(-1);
    
    // Add command to output
    setOutput(prev => [...prev, `$ ${command}`]);
    
    try {
      // Simulate command execution delay
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const result = await simulateCommand(command);
      setOutput(prev => [...prev, ...result]);
    } catch (error) {
      setOutput(prev => [...prev, `Error: ${error}`, '']);
    } finally {
      setIsRunning(false);
      setCurrentInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCurrentInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : -1;
        setHistoryIndex(newIndex);
        setCurrentInput(newIndex === -1 ? '' : commandHistory[newIndex]);
      }
    }
  };

  const clearTerminal = () => {
    setOutput(['$ Terminal cleared', '']);
  };

  return (
    <div className="h-full flex flex-col glass-strong border-t border-glass-border/20">
      {/* Terminal Header */}
      <div className="flex items-center justify-between p-2 border-b border-glass-border/20">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Terminal</span>
          <span className="text-xs text-muted-foreground">{workingDirectory}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearTerminal}
            className="p-1 rounded hover:bg-glass/20 text-muted-foreground hover:text-foreground"
            title="Clear terminal"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-glass/20 text-muted-foreground hover:text-foreground"
            title="Close terminal"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div 
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-sm bg-black/20"
      >
        {output.map((line, index) => (
          <div 
            key={index} 
            className={`${line.startsWith('$') ? 'text-green-400' : 'text-gray-300'} leading-relaxed`}
          >
            {line}
          </div>
        ))}
        
        {/* Current Input Line */}
        <div className="flex items-center text-green-400">
          <span>$ </span>
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            className="flex-1 bg-transparent border-none outline-none text-gray-300 font-mono"
            placeholder={isRunning ? "Executing..." : "Enter command..."}
          />
          {isRunning && (
            <div className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full ml-2" />
          )}
        </div>
      </div>
    </div>
  );
};

export default TerminalComponent;