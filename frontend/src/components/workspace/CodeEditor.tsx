import { useState, useEffect, useRef } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { Save, Terminal, Settings, Search, Replace, Download, Upload, Maximize2, Minimize2 } from 'lucide-react';
import { FileItem } from '@/types';
import TerminalComponent from './Terminal';

interface CodeEditorProps {
  file?: FileItem;
  onSave: (content: string) => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ file, onSave }) => {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('html');
  const [isModified, setIsModified] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);

  useEffect(() => {
    const content = file?.content || '// Select a file to view its content';
    setCode(content);
    setIsModified(false);
    // Determine language from file extension
    const ext = file?.name.split('.').pop();
    switch (ext) {
      case 'jsx':
      case 'js':
        setLanguage('javascript');
        break;
      case 'ts':
      case 'tsx':
        setLanguage('typescript');
        break;
      case 'css':
        setLanguage('css');
        break;
      case 'html':
        setLanguage('html');
        break;
      case 'json':
        setLanguage('json');
        break;
      case 'md':
        setLanguage('markdown');
        break;
      case 'py':
        setLanguage('python');
        break;
      case 'yml':
      case 'yaml':
        setLanguage('yaml');
        break;
      case 'xml':
        setLanguage('xml');
        break;
      case 'sql':
        setLanguage('sql');
        break;
      case 'php':
        setLanguage('php');
        break;
      case 'java':
        setLanguage('java');
        break;
      case 'c':
        setLanguage('c');
        break;
      case 'cpp':
      case 'cxx':
        setLanguage('cpp');
        break;
      case 'sh':
        setLanguage('shell');
        break;
      default:
        setLanguage('plaintext');
    }
  }, [file]);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Enhanced keybindings
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
    
    // Toggle terminal
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backquote, () => {
      setShowTerminal(prev => !prev);
    });
    
    // Search
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      setShowSearchReplace(true);
    });
    
    // Replace
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => {
      setShowSearchReplace(true);
    });
    
    // Format document
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      editor.getAction('editor.action.formatDocument')?.run();
    });
    
    // Configure additional language features
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
  };

  const handleSave = () => {
    onSave(code);
    setIsModified(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const handleSearch = () => {
    if (editorRef.current && searchValue) {
      editorRef.current.getAction('actions.find')?.run();
    }
  };

  const handleReplace = () => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      const matches = model.findMatches(searchValue, false, false, false, null, false);
      
      matches.forEach((match: any) => {
        editorRef.current.executeEdits('replace', [{
          range: match.range,
          text: replaceValue,
          forceMoveMarkers: true
        }]);
      });
    }
  };

  const downloadFile = () => {
    if (file && code) {
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const uploadFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,.ts,.jsx,.tsx,.html,.css,.json,.md,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setCode(content);
          setIsModified(true);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-full'} flex flex-col glass-strong`}>
      {/* Header */}
      <div className="p-2 border-b border-glass-border/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              {file?.name || 'No file selected'}
              {isModified && <span className="text-primary ml-1">•</span>}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowSearchReplace(!showSearchReplace)}
              className="btn-glass p-2"
              title="Search & Replace (Ctrl+F)"
            >
              <Search className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setShowTerminal(!showTerminal)}
              className={`btn-glass p-2 ${showTerminal ? 'bg-primary/20' : ''}`}
              title="Toggle Terminal (Ctrl+`)"
            >
              <Terminal className="w-4 h-4" />
            </button>
            <button 
              onClick={downloadFile}
              disabled={!file}
              className="btn-glass p-2 disabled:opacity-50"
              title="Download File"
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={uploadFile}
              className="btn-glass p-2"
              title="Upload File"
            >
              <Upload className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`btn-glass p-2 ${showSettings ? 'bg-primary/20' : ''}`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onClick={toggleFullscreen}
              className="btn-glass p-2"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button 
              onClick={handleSave}
              disabled={!isModified}
              className="btn-glass p-2 disabled:opacity-50"
              title="Save (Ctrl+S)"
            >
              <Save className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Search & Replace Panel */}
        {showSearchReplace && (
          <div className="mt-2 p-3 bg-glass/20 rounded-lg border border-glass-border/20">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                placeholder="Search..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="glass-input flex-1 text-sm"
              />
              <button onClick={handleSearch} className="btn-glass px-3 py-1 text-sm">
                Find
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Replace..."
                value={replaceValue}
                onChange={(e) => setReplaceValue(e.target.value)}
                className="glass-input flex-1 text-sm"
              />
              <button onClick={handleReplace} className="btn-glass px-3 py-1 text-sm">
                <Replace className="w-3 h-3 mr-1" />
                Replace All
              </button>
            </div>
          </div>
        )}
        
        {/* Settings Panel */}
        {showSettings && (
          <div className="mt-2 p-3 bg-glass/20 rounded-lg border border-glass-border/20">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <label htmlFor="fontSize">Font Size:</label>
                <input
                  id="fontSize"
                  type="range"
                  min="10"
                  max="24"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="flex-1"
                  title={`Font size: ${fontSize}px`}
                />
                <span className="w-8 text-right">{fontSize}</span>
              </div>
              <div className="flex items-center gap-2">
                <label>
                  <input
                    type="checkbox"
                    checked={wordWrap}
                    onChange={(e) => setWordWrap(e.target.checked)}
                    className="mr-2"
                  />
                  Word Wrap
                </label>
              </div>
              <div className="flex items-center gap-2">
                <label>
                  <input
                    type="checkbox"
                    checked={minimap}
                    onChange={(e) => setMinimap(e.target.checked)}
                    className="mr-2"
                  />
                  Minimap
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div 
          className={`${showTerminal ? 'flex-1' : 'h-full'} overflow-hidden`}
          onKeyDown={handleKeyDown}
        >
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={(value) => {
              setCode(value || '');
              setIsModified(true);
            }}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              fontSize,
              fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
              fontLigatures: true,
              minimap: { enabled: minimap },
              scrollBeyondLastLine: false,
              wordWrap: wordWrap ? 'on' : 'off',
              lineNumbers: 'on',
              renderLineHighlight: 'all',
              selectionHighlight: true,
              tabSize: 2,
              insertSpaces: true,
              automaticLayout: true,
              padding: { top: 16, bottom: 16 },
              suggestOnTriggerCharacters: true,
              quickSuggestions: {
                other: true,
                comments: true,
                strings: true
              },
              acceptSuggestionOnCommitCharacter: true,
              acceptSuggestionOnEnter: 'on',
              contextmenu: true,
              copyWithSyntaxHighlighting: true,
              cursorBlinking: 'blink',
              find: {
                addExtraSpaceOnTop: false,
                autoFindInSelection: 'never',
                seedSearchStringFromSelection: 'always'
              },
              folding: true,
              foldingHighlight: true,
              foldingStrategy: 'indentation',
              formatOnPaste: true,
              formatOnType: true,
              glyphMargin: true,
              links: true,
              matchBrackets: 'always',
              mouseWheelZoom: true,
              multiCursorModifier: 'ctrlCmd',
              parameterHints: { enabled: true },
              renderControlCharacters: false,
              renderWhitespace: 'selection',
              roundedSelection: true,
              smoothScrolling: true,
              snippetSuggestions: 'top',
              suggest: {
                filterGraceful: true,
                snippetsPreventQuickSuggestions: false
              },
              tabCompletion: 'on',
              bracketPairColorization: { enabled: true },
              guides: {
                bracketPairs: 'active',
                bracketPairsHorizontal: 'active',
                highlightActiveBracketPair: true,
                indentation: true
              }
            }}
          />
        </div>
        
        {/* Terminal */}
        {showTerminal && (
          <div className="h-[200px] min-h-[150px] max-h-[400px] resize-y overflow-hidden">
            <TerminalComponent 
              onClose={() => setShowTerminal(false)}
              workingDirectory={file ? `/project/${file.name.split('/')[0] || 'root'}` : '/project'}
            />
          </div>
        )}
      </div>
      
      {/* Enhanced Status Bar */}
      <div className="px-4 py-2 border-t border-glass-border/20 text-xs text-muted-foreground flex justify-between items-center bg-glass/10">
        <div className="flex items-center gap-4">
          <span className="font-medium">{language.toUpperCase()}</span>
          <span>Lines: {code.split('\n').length}</span>
          <span>Chars: {code.length}</span>
          {isModified && <span className="text-primary">● Modified</span>}
        </div>
        <div className="flex items-center gap-4">
          <span>Ctrl+S: Save</span>
          <span>Ctrl+`: Terminal</span>
          <span>Ctrl+F: Search</span>
          {showTerminal && <span className="text-primary">● Terminal Active</span>}
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;