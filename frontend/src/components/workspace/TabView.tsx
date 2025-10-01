import React from 'react';

interface TabViewProps {
  activeTab: 'code' | 'preview';
  onTabChange: (tab: 'code' | 'preview') => void;
}

const TabView: React.FC<TabViewProps> = ({ activeTab, onTabChange }) => (
  <div className="flex border-b border-glass-border/20 bg-glass/5">
    <button
      onClick={() => onTabChange('code')}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-glow ${
        activeTab === 'code'
          ? 'text-primary border-b-2 border-primary bg-primary/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-glass/10'
      }`}
    >
      Code
    </button>
    <button
      onClick={() => onTabChange('preview')}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-glow ${
        activeTab === 'preview'
          ? 'text-primary border-b-2 border-primary bg-primary/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-glass/10'
      }`}
    >
      Preview
    </button>
  </div>
);

export default TabView;
