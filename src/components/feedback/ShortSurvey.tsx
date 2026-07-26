import React, { useState } from 'react';
import { X, Send, Clock, HelpCircle, EyeOff, Frown } from 'lucide-react';
import { api } from '@/utils/api';

interface ShortSurveyProps {
  trigger: 'session_nudge' | 'exit_intent';
  onClose: () => void;
  sessionEntryCount?: number;
}

export const ShortSurvey: React.FC<ShortSurveyProps> = ({ trigger, onClose, sessionEntryCount = 0 }) => {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setAnswer = (key: string, value: unknown) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const handleDismiss = async () => {
    try {
      await api.post('/feedback/dismiss', { trigger });
    } catch (error) {
      console.error('Failed to dismiss survey:', error);
    }
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post('/feedback', {
        variant: 'short',
        trigger,
        answers,
        questionnaire_version: '1.0',
        context: {
          locale: navigator.language,
          session_entry_count: sessionEntryCount,
        },
      });
      await api.post('/feedback/dismiss', { trigger });
    } catch (error) {
      console.error('Failed to submit survey:', error);
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="card p-5 max-w-sm w-full text-center shadow-xl">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-accent/10 flex items-center justify-center">
            <Send className="w-5 h-5 text-accent" />
          </div>
          <h3 className="text-base font-bold text-primary mb-1">Thanks!</h3>
          <p className="text-sm text-secondary mb-3">
            Want to share more? Tap 'Help us improve' anytime in the sidebar.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-all"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="card p-5 max-w-sm w-full shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-primary">Quick feedback</h3>
          <button
            onClick={handleDismiss}
            className="p-1 text-muted hover:text-primary rounded-lg hover:bg-hover transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Q1: overall_feel */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-primary">How's it going so far?</p>
            <div className="flex items-center gap-1 justify-center">
              <span className="text-[10px] text-muted w-10 text-right leading-tight">Poor</span>
              {[1, 2, 3, 4, 5].map(n => {
                const labels = ['', 'Poor', 'Okay', 'Good', 'Great', 'Excellent'];
                return (
                  <button
                    key={n}
                    onClick={() => setAnswer('overall_feel', n)}
                    className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-xl border transition-all min-w-0 flex-1 ${
                      answers.overall_feel === n
                        ? 'border-accent bg-accent-tint ring-1 ring-accent'
                        : 'border-default text-secondary hover:border-hover hover:bg-hover'
                    }`}
                  >
                    <span className={`text-sm font-bold ${answers.overall_feel === n ? 'text-accent' : ''}`}>{n}</span>
                    <span className={`text-[8px] leading-tight ${answers.overall_feel === n ? 'text-accent' : 'text-muted'}`}>
                      {labels[n]}
                    </span>
                  </button>
                );
              })}
              <span className="text-[10px] text-muted w-10 leading-tight">Great</span>
            </div>
          </div>

          {/* Q2: journaling_blocker (exit_intent only) */}
          {trigger === 'exit_intent' && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary">What stopped you from writing more today?</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { value: 'No time', label: 'No time', icon: Clock },
                  { value: "Didn't know what", label: "Didn't know what", icon: HelpCircle },
                  { value: "Didn't feel like it", label: "Didn't feel like it", icon: Frown },
                  { value: 'Just exploring', label: 'Just exploring', icon: EyeOff },
                ].map(opt => {
                  const Icon = opt.icon;
                  const isSelected = answers.journaling_blocker === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setAnswer('journaling_blocker', opt.value)}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all ${
                        isSelected
                          ? 'border-accent bg-accent-tint ring-1 ring-accent'
                          : 'border-default text-secondary hover:border-hover hover:bg-hover'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-accent' : 'text-muted'}`} />
                      <span className={`text-[10px] leading-tight ${isSelected ? 'text-accent font-medium' : ''}`}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Q3: open_note */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-primary mb-0.5">Anything you want to tell us?</p>
            <textarea
              value={(answers.open_note as string) || ''}
              onChange={e => setAnswer('open_note', e.target.value)}
              placeholder="Optional..."
              className="w-full px-3 py-2 rounded-lg border border-default bg-surface text-primary text-sm focus:border-accent min-h-[50px]"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4 pt-2.5 border-t border-default">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2 rounded-lg border border-default text-sm text-secondary hover:text-primary hover:bg-hover transition-all"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-all disabled:opacity-50"
          >
            {submitting ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};
