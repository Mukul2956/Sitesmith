import React, { useState } from 'react';
import { FolderTree, FileCode, FileText, Image, ChevronRight, ChevronDown } from 'lucide-react';
import { FileItem } from '@/types';

interface FileExplorerProps {
  files: FileItem[];
  onFileSelect: (file: FileItem) => void;
}

const getFileIcon = (extension?: string) => {
  switch (extension) {
    case 'html':
    case 'jsx':
    case 'js':
    case 'ts':
    case 'tsx':
      return <FileCode className="w-4 h-4 text-primary" />;
    case 'css':
      return <FileCode className="w-4 h-4 text-neon-purple" />;
    case 'json':
      return <FileText className="w-4 h-4 text-neon-green" />;
    case 'md':
      return <FileText className="w-4 h-4 text-foreground" />;
    case 'ico':
    case 'png':
    case 'jpg':
    case 'svg':
      return <Image className="w-4 h-4 text-neon-pink" />;
    default:
      return <FileText className="w-4 h-4 text-muted-foreground" />;
  }
};

function FileNode({ item, depth, onFileClick }: { item: FileItem; depth: number; onFileClick: (file: FileItem) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = () => {
    if (item.type === 'folder') {
      setIsExpanded(!isExpanded);
    } else {
      onFileClick(item);
    }
  };

  if (item.type === 'folder') {
    return (
      <div className="select-none">
        <div
          className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-lg hover:bg-glass/20 transition-glow group ${
            depth === 0 ? 'font-medium' : ''
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={handleClick}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <FolderTree className="w-4 h-4 text-primary" />
          <span className="text-sm text-foreground">{item.name}</span>
        </div>
        {isExpanded && item.children && (
          <div>
            {item.children.map((child, index) => (
              <FileNode
                key={`${child.path}-${index}`}
                item={child}
                depth={depth + 1}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}
      </div>
    );
  } else {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-lg hover:bg-glass/20 transition-glow select-none"
        style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
        onClick={handleClick}
      >
        {getFileIcon(item.name.split('.').pop())}
        <span className="text-sm text-foreground">{item.name}</span>
      </div>
    );
  }
}

const FileExplorer: React.FC<FileExplorerProps> = ({ files, onFileSelect }) => {
  return (
    <div className="h-full flex flex-col glass-strong">
      {/* Header */}
      <div className="p-4 border-b border-glass-border/20">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Explorer</h2>
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {files.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              <FolderTree className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No files to display</p>
              <p className="text-sm">Generate a project to see files here</p>
            </div>
          ) : (
            files.map((file, index) => (
              <FileNode
                key={`${file.path}-${index}`}
                item={file}
                depth={0}
                onFileClick={onFileSelect}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-glass-border/20">
        <div className="text-xs text-muted-foreground">
          {files.length} items
        </div>
      </div>
    </div>
  );
};

export default FileExplorer;