import React from 'react';
import { FlaskConical, X } from 'lucide-react';

interface AlphaWarningModalProps {
  isOpen: boolean;
  onDismiss: () => void;
}

export const AlphaWarningModal: React.FC<AlphaWarningModalProps> = ({
  isOpen,
  onDismiss,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onDismiss} />
      <div className="relative z-10 card p-6 rounded-xl max-w-md w-full mx-4 shadow-card-lg">
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-accent-tint text-muted hover:text-body transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-accent-muted">
            <FlaskConical className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h3 className="text-xl font-serif font-bold text-body">
              Welcome to the Alpha
            </h3>
            <span className="text-xs font-semibold text-accent bg-accent-muted px-2 py-0.5 rounded uppercase tracking-wider inline-block mt-1">Alpha</span>
          </div>
        </div>

        <div className="space-y-3 text-sm text-secondary">
          <p>
            You're using an early version of <strong className="text-body">My Inner Pages</strong>. Things are still taking shape — you may run into bugs, rough edges, or missing features.
          </p>
          <p>
            Your feedback is incredibly valuable. If something doesn't work as expected, or if you have ideas for improvement, please let us know.
          </p>
        </div>

        <button
          onClick={onDismiss}
          className="btn-primary w-full mt-6 py-3 px-4 rounded-lg font-medium transition-all"
        >
          Got it
        </button>
      </div>
    </div>
  );
};
