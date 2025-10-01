import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, CheckCircle, Circle, Clock } from 'lucide-react';
import { Step } from '@/types';


interface ChatPanelProps {
  step: Step[];
  currentStep: number;
  onStepClick: (stepId: number) => void;
  onNewMessage: (message: string) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ step, currentStep, onStepClick, onNewMessage }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [step]);

  const handleSend = async () => {
    console.log('Button clicked, input:', input);
    if (input.trim() && !isLoading) {
      console.log('Sending message:', input.trim());
      setIsLoading(true);
      
      try {
        if (typeof onNewMessage === 'function') {
          await onNewMessage(input.trim());
          setInput(''); // Only clear input on success
        } else {
          console.warn('onNewMessage is not a function:', onNewMessage);
        }
      } catch (error) {
        console.error('Failed to send message:', error);
        // Keep input so user can retry
      } finally {
        setIsLoading(false);
      }
    } else {
      console.log('Input is empty or already sending.');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in-progress':
        return <Clock className="w-5 h-5 text-blue-400" />;
      case 'pending':
        return <Circle className="w-5 h-5 text-gray-600" />;
      default:
        return <Circle className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="h-full flex flex-col glass-strong">
      {/* Header */}
      <div className="p-4 border-b border-glass-border/20">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">Build Steps</h2>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {step.map((stepItem, index) => {
          const stepId = stepItem.id ?? index + 1; // Use step.id or fallback to index+1
          return (
            <div
              key={stepItem.id || index}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                currentStep === stepId
                  ? 'bg-primary/20 border border-primary/30'
                  : 'hover:bg-glass/20'
              }`}
              onClick={() => onStepClick(stepId)}
            >
              <div className="flex items-center gap-3">
                {getStepIcon(stepItem.status || 'pending')}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground">{stepItem.title}</h3>
                  {stepItem.description && (
                    <p className="text-sm text-muted-foreground mt-1">{stepItem.description}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-glass-border/20">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={isLoading ? "AI is thinking..." : "Ask AI to modify your website..."}
            className="glass-input flex-1 text-sm"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="btn-glass p-2 disabled:opacity-50"
            title={isLoading ? "Sending..." : "Send message"}
          >
            {isLoading ? (
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;