import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare, Send, Square, Loader2, AlertCircle, RotateCw, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { useChatStream } from '@hooks/useChatStream';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ChatHistorySidebar } from './ChatHistorySidebar';
import { CopyButton } from './CopyButton';
import { api } from '@utils/api';
import { chatListResponseSchema } from '@/types/schemas';
import type { ChatSummary } from '@/types/chat';

const MAX_TEXTAREA_ROWS = 10;
const LINE_HEIGHT = 22;
const INPUT_VERTICAL_PADDING = 24;

interface ChatViewProps {
  isDark: boolean;
  initialMessage?: string | null;
  onInitialMessageSent?: () => void;
  chatHistoryOpen: boolean;
  onToggleChatHistory: () => void;
  selectedChatId: string | null;
  onSelectChat: (id: string | null, action?: 'push' | 'replace') => void;
  chatContext?: { type: 'journal'; title: string } | { type: 'mirror'; mode: string } | null;
}

export const ChatView: React.FC<ChatViewProps> = ({
  isDark,
  initialMessage,
  onInitialMessageSent,
  chatHistoryOpen,
  onToggleChatHistory,
  selectedChatId,
  onSelectChat,
  chatContext,
}) => {
  const {
    chatId,
    messages,
    connectionState,
    isStreaming,
    isContextLoaded,
    error,
    sendMessage,
    sendEdit,
    stopStreaming,
    regenerate,
    startNewChat,
    loadChat,
  } = useChatStream();

  const isLoadingHistory = selectedChatId !== null && selectedChatId !== 'new' && chatId !== selectedChatId;

  // Load target chat or start new chat based on selectedChatId prop (URL parameter)
  const chatIdRef = useRef(chatId);
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    setChatListError(null);
    const currentChatId = chatIdRef.current;
    if (selectedChatId === 'new') {
      if (currentChatId !== null || messages.length > 0) {
        startNewChat();
      }
    } else if (selectedChatId !== null) {
      if (currentChatId !== selectedChatId) {
        loadChat(selectedChatId);
      }
    }
  }, [selectedChatId, loadChat, startNewChat]);

  // Sync new chat creation back to parent/URL
  const selectedChatIdRef = useRef(selectedChatId);
  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  const onSelectChatRef = useRef(onSelectChat);
  useEffect(() => {
    onSelectChatRef.current = onSelectChat;
  }, [onSelectChat]);

  const prevChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentSelected = selectedChatIdRef.current;
    if (chatId && chatId !== prevChatIdRef.current && (currentSelected === 'new' || currentSelected === null)) {
      onSelectChatRef.current(chatId, 'replace');
    }
    prevChatIdRef.current = chatId;
  }, [chatId]);
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [chatList, setChatList] = useState<ChatSummary[]>([]);
  const [chatListError, setChatListError] = useState<string | null>(null);
  const COLLAPSE_THRESHOLD = 280;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const initialRender = useRef(true);
  const userScrolledUp = useRef(false);
  const processedMessageRef = useRef<string>('');
  const pendingMessageRef = useRef<string | null>(null);
  const prevStreaming = useRef(isStreaming);
  const titleRefreshed = useRef(false);

  const loadChatList = useCallback(async () => {
    try {
      const data = await api.get('/chats', chatListResponseSchema);
      if (data?.items) {
        setChatList(data.items);
      }
      setChatListError(null);
    } catch {
      setChatListError('Failed to load chat history');
    }
  }, []);

  useEffect(() => {
    loadChatList();
  }, [loadChatList]);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      return;
    }
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (chatId) {
      loadChatList();
    }
  }, [chatId, loadChatList]);

  useEffect(() => {
    if (!titleRefreshed.current && messages.length >= 2 && chatId) {
      titleRefreshed.current = true;
      const title = messages[0].content.replace(/\n/g, ' ').slice(0, 100).trim() || 'New chat';
      setChatList(prev => prev.map(c => c.id === chatId ? { ...c, title } : c));
    }
  }, [messages.length, chatId]);

  useEffect(() => {
    if (prevStreaming.current && !isStreaming && messages.length > 0) {
      loadChatList();
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, messages.length, loadChatList]);

  useEffect(() => {
    if (initialMessage && initialMessage !== processedMessageRef.current) {
      processedMessageRef.current = initialMessage;
      pendingMessageRef.current = initialMessage;
      startNewChat();
    }
  }, [initialMessage, startNewChat]);

  useEffect(() => {
    if (connectionState === 'connected' && pendingMessageRef.current) {
      sendMessage(pendingMessageRef.current);
      pendingMessageRef.current = null;
      onInitialMessageSent?.();
    }
  }, [connectionState, sendMessage, onInitialMessageSent]);

  useEffect(() => {
    const onScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const clientHeight = window.innerHeight;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 80;
      userScrolledUp.current = !isAtBottom;
      setShowScrollButton(!isAtBottom && messages.length > 0);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [messages.length]);

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const maxHeight = MAX_TEXTAREA_ROWS * LINE_HEIGHT;
    const minHeight = LINE_HEIGHT + INPUT_VERTICAL_PADDING;
    el.style.height = '0px';
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || connectionState !== 'connected' || isStreaming) return;
    userScrolledUp.current = false;
    sendMessage(trimmed);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (connectionState === 'connected' && !isStreaming) {
      inputRef.current?.focus();
    }
  }, [connectionState, isStreaming]);

  const toggleExpand = (id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const editAutoResize = useCallback(() => {
    const el = editInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    el.style.overflowY = 'hidden';
  }, []);

  useEffect(() => {
    editAutoResize();
  }, [editContent, editAutoResize]);

  const handleCopy = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    userScrolledUp.current = false;
    setShowScrollButton(false);
  };

  const lastUserIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return i;
    }
    return -1;
  }, [messages]);

  const handleSelectChat = (id: string) => {
    onSelectChat(id);
  };

  const handleDeleteChat = async (id: string) => {
    const previous = chatList;
    setChatList(prev => prev.filter(c => c.id !== id));
    if (chatId === id) {
      onSelectChat('new');
    }
    try {
      await api.delete(`/chats/${id}`);
    } catch {
      setChatList(previous);
    }
  };

  const handleNewChat = () => {
    titleRefreshed.current = false;
    onSelectChat('new');
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)]">
      <div className="flex-1 min-w-0">
      <div className="px-4 pt-2 pb-0">
        <div className="w-full max-w-4xl mx-auto">
          <div className="rounded-2xl bg-elevated border border-default">
            {isLoadingHistory ? (
              <div className="min-h-[calc(100dvh-6rem)] flex flex-col items-center justify-center p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-accent mb-4" />
                <p className="text-sm text-muted">Loading chat history...</p>
              </div>
            ) : (
              <>
                {chatContext && (
                  <div className="flex justify-center pt-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
                      {chatContext.type === 'journal' ? (
                        <>Chatting about: {chatContext.title}</>
                      ) : (
                        <>Exploring: {chatContext.mode} Reflection</>
                      )}
                    </span>
                  </div>
                )}
                {messages.length === 0 ? (
                  <div className="min-h-[calc(100dvh-6rem)] flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mb-4 shadow-lg">
                      <MessageSquare className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-body mb-2">Ask me anything</h2>
                    <p className="text-sm text-muted max-w-sm">
                      {"I've loaded your recent journal entries for context. Ask me about patterns, insights, or anything on your mind."}
                    </p>
                    {error && (
                      <div className="mt-4 flex items-center gap-2 text-red-500 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 space-y-6 pb-28 min-h-[calc(100dvh-6rem)]">
                {isContextLoaded && messages.length > 1 && (
                  <div className="flex justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-accent-tint text-accent-tint">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      Journals loaded
                    </span>
                  </div>
                )}
                {messages.map((msg, idx) => {
                  const isLastUserMsg = idx === lastUserIdx;
                  const isLastAssistant = idx === messages.length - 1 && msg.role === 'assistant' && lastUserIdx !== -1;
                  return (
                    <div
                      key={msg.id}
                      className={`group flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'user' ? (
                        <div className={`flex flex-col items-end gap-1 ${editingId === msg.id ? 'max-w-full w-full' : 'max-w-[90%] sm:max-w-[85%]'}`}>
                          {editingId === msg.id ? (
                            <div className="rounded-2xl p-2 bg-accent w-full">
                              <textarea
                                ref={editInputRef}
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendEdit(editContent, lastUserIdx);
                                    setEditingId(null);
                                    setEditContent('');
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingId(null);
                                    setEditContent('');
                                  }
                                }}
                                className="w-full resize-none bg-transparent outline-none text-white placeholder:text-white/50 scrollbar-theme"
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end mt-2">
                                <button
                                  onClick={() => { setEditingId(null); setEditContent(''); }}
                                  className="text-xs text-white/70 hover:text-white transition-colors px-2 py-1"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    sendEdit(editContent, lastUserIdx);
                                    setEditingId(null);
                                    setEditContent('');
                                  }}
                                  className="text-xs bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded transition-colors"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl px-4 py-2.5 bg-accent text-white relative">
                              <div className={`content-typography chat-typography !text-white [&_*]:!text-white whitespace-pre-wrap ${msg.content === '' ? 'animate-pulse' : ''} ${!expandedMessages.has(msg.id) && msg.content.length > COLLAPSE_THRESHOLD ? 'max-h-32 overflow-hidden' : ''}`}>
                                {msg.content || '▊'}
                              </div>

                              {msg.content.length > COLLAPSE_THRESHOLD && (
                                <button
                                  onClick={() => toggleExpand(msg.id)}
                                  className="flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors mt-1"
                                >
                                  {expandedMessages.has(msg.id) ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</> : <><ChevronDown className="w-3.5 h-3.5" /> Show more</>}
                                </button>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-0.5">
                            {editingId !== msg.id && (
                              <CopyButton messageId={msg.id} content={msg.content} copiedId={copiedId} onCopy={handleCopy} />
                            )}
                            {isLastUserMsg && !editingId && !isStreaming && (
                              <button
                                onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }}
                                className="md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity p-1 rounded hover:bg-accent-tint text-muted"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-start gap-1 max-w-[90%] sm:max-w-[85%]">
                          <div className="min-w-0">
                            {msg.content ? (
                              <MarkdownRenderer content={msg.content} isDark={isDark} />
                            ) : msg.id === 'streaming' && isStreaming ? (
                              <p className="text-sm leading-relaxed text-muted animate-pulse">
                                Generating<span className="dots-animation" />
                              </p>
                            ) : (
                              <p className="text-sm leading-relaxed animate-pulse">▊</p>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <CopyButton messageId={msg.id} content={msg.content} copiedId={copiedId} onCopy={handleCopy} />
                            {isLastAssistant && !isStreaming && (
                              <button
                                onClick={regenerate}
                                className="md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity p-1 rounded hover:bg-accent-tint text-muted"
                                title="Regenerate"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </>)}
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-0 px-4 pb-4 pt-4 bg-gradient-to-t from-base via-base/95 via-60% to-transparent pointer-events-none"
        style={{ right: chatHistoryOpen ? 320 : 0 }}
      >
        <div className="max-w-4xl mx-auto px-3 pointer-events-auto">
          {showScrollButton && (
            <div className="flex justify-center -translate-y-1">
              <button
                onClick={scrollToBottom}
                className="w-9 h-9 rounded-full bg-accent text-white shadow-lg hover:scale-110 transition-all flex items-center justify-center"
                title="Scroll to bottom"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          )}

          {error && (
            <div className="mb-2 flex items-center gap-2 text-red-500 text-xs">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1">{error}</span>
            </div>
          )}
          <div className="flex gap-3 items-end bg-surface rounded-xl border border-default p-2 shadow-lg">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                connectionState === 'connected' ? 'Type a message...'
                : connectionState === 'failed' ? 'Connection lost'
                : 'Disconnected'
              }
              disabled={connectionState !== 'connected'}
              className="flex-1 resize-none bg-transparent px-2 py-3 text-sm outline-none disabled:opacity-50 scrollbar-theme text-body placeholder:text-muted"
              style={{ lineHeight: `${LINE_HEIGHT}px`, maxHeight: `${MAX_TEXTAREA_ROWS * LINE_HEIGHT}px`, height: `${LINE_HEIGHT + INPUT_VERTICAL_PADDING}px` }}
            />
            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || connectionState !== 'connected'}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                  input.trim() && connectionState === 'connected'
                    ? 'bg-accent text-white shadow-md hover:shadow-lg hover:scale-105'
                    : 'bg-surface-hover text-muted'
                } disabled:cursor-not-allowed`}
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      </div>

      {chatHistoryOpen && chatListError && (
        <div className="fixed right-0 top-16 z-50 w-80 p-3 text-xs text-red-500 bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900/50">
          {chatListError}
        </div>
      )}
      <ChatHistorySidebar
        isOpen={chatHistoryOpen}
        chats={chatList}
        activeChatId={chatId}
        onClose={onToggleChatHistory}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onNewChat={handleNewChat}
      />
    </div>
  );
};
