import React from 'react';
import { Menu, List } from 'lucide-react';
import { ViewType } from '@/types';

interface HeaderProps {
  activeView: ViewType;
  onMenuClick: () => void;
  onNavigationClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onMenuClick,
  onNavigationClick,
}) => {
  const getViewTitle = () => {
    switch (activeView) {
      case 'journal': return 'Your Journal';
      case 'mirror': return 'Mirror';
      case 'chat': return 'Chat';
      case 'settings': return 'Settings';
      default: return 'Your Journal';
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 h-16 bg-surface/90 backdrop-blur-lg border-b border-default z-40 flex items-center justify-between px-4`}
    >
      <div className="flex items-center">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg hover:bg-accent-tint"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6 text-body" />
        </button>
        <h1 className="ml-4 text-xl font-serif font-bold text-body flex items-center gap-2">
          {getViewTitle()}
          <span className="text-[10px] font-medium text-accent bg-accent-tint px-1.5 py-0.5 rounded uppercase">Alpha</span>
        </h1>
      </div>

      {activeView === 'chat' && onNavigationClick && (
        <button
          onClick={onNavigationClick}
          className="p-2 rounded-lg hover:bg-accent-tint"
          title="Chat History"
          aria-label="Chat History"
        >
          <List className="w-6 h-6 text-body" />
        </button>
      )}
    </header>
  );
};
