import { useReducer, useRef, useCallback, useEffect } from 'react';
import type { ChatMessage, ConnectionState, MessageStatus } from '@/types/chat';
import { api } from '@utils/api';
import { chatResponseSchema } from '@/types/schemas';
import { chatReducer, initialChatState } from './chatReducer';
import { buildUserMessage, buildPlaceholder } from './chatHelpers';
import { getAuthSession } from '@utils/authSession';

interface UseChatStreamReturn {
  chatId: string | null;
  messages: ChatMessage[];
  connectionState: ConnectionState;
  isStreaming: boolean;
  isContextLoaded: boolean;
  error: string | null;
  resumed: boolean;
  sendMessage: (content: string) => void;
  sendEdit: (content: string, messageIndex: number) => void;
  stopStreaming: () => void;
  regenerate: () => void;
  disconnect: () => void;
  startNewChat: () => void;
  loadChat: (chatId: string) => Promise<void>;
}

export function useChatStream(): UseChatStreamReturn {
  const [state, dispatch] = useReducer(chatReducer, {
    ...initialChatState,
    connectionState: 'connected',
    isContextLoaded: true, // SSE needs no connection handshake; ready immediately
  });

  const chatIdRef = useRef<string | null>(state.chatId);
  chatIdRef.current = state.chatId;

  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  const loadGenRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    dispatch({ type: 'STOP_STREAMING' });
  }, []);

  const executeStream = useCallback(
    async (
      content: string,
      targetChatId: string | null,
      messageId: string,
      editMessageIndex?: number,
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v0';

      try {
        const response = await fetch(`${API_BASE_URL}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            content,
            chat_id: targetChatId,
            message_id: messageId,
            edit_message_index: editMessageIndex,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errorMsg = 'Failed to connect to server';
          try {
            const errJson = await response.json();
            errorMsg = errJson.detail || errorMsg;
          } catch (error) {
            console.error('Failed to parse stream error response:', error);
          }
          dispatch({ type: 'STREAM_ERROR', error: errorMsg });
          if (response.status === 401) {
            window.dispatchEvent(new CustomEvent('auth:expired'));
          }
          return;
        }

        if (!response.body) {
          dispatch({ type: 'STREAM_ERROR', error: 'No response body received' });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const block of parts) {
            if (!block.trim()) continue;
            let eventName = 'message';
            let eventData: unknown = null;

            for (const line of block.split('\n')) {
              const trimmed = line.trim();
              if (trimmed.startsWith('event:')) {
                eventName = trimmed.slice(6).trim();
              } else if (trimmed.startsWith('data:')) {
                const rawData = trimmed.slice(5).trim();
                try {
                  eventData = JSON.parse(rawData);
                } catch {
                  eventData = rawData;
                }
              }
            }

            if (eventData !== null) {
              const data = eventData as Record<string, unknown>;
              switch (eventName) {
                case 'context_loaded':
                  if (typeof data.chat_id === 'string') {
                    chatIdRef.current = data.chat_id;
                    dispatch({ type: 'CONTEXT_LOADED', chatId: data.chat_id });
                  }
                  break;
                case 'ack':
                  if (typeof data.message_id === 'string') {
                    dispatch({
                      type: 'SET_MESSAGE_STATUS',
                      messageId: data.message_id,
                      status: 'delivered',
                    });
                  }
                  break;
                case 'token':
                  if (typeof data.content === 'string') {
                    dispatch({ type: 'STREAM_TOKEN', content: data.content });
                  }
                  break;
                case 'done':
                  dispatch({
                    type: 'STREAM_DONE',
                    chatId: (data.chat_id as string) || chatIdRef.current || undefined,
                  });
                  break;
                case 'error':
                  dispatch({
                    type: 'STREAM_ERROR',
                    error: (data.content as string) || 'An error occurred',
                  });
                  break;
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          dispatch({ type: 'STOP_STREAMING' });
        } else {
          dispatch({
            type: 'STREAM_ERROR',
            error: 'Network error during stream response',
          });
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [],
  );

  const sendMessage = useCallback(
    (content: string) => {
      const msgId = crypto.randomUUID();
      const status: MessageStatus = 'sending';

      dispatch({
        type: 'APPEND_MESSAGE',
        userMsg: buildUserMessage(msgId, content, status),
        placeholder: buildPlaceholder(),
      });

      executeStream(content, chatIdRef.current, msgId);
    },
    [executeStream],
  );

  const sendEdit = useCallback(
    (content: string, messageIndex: number) => {
      const msgId = crypto.randomUUID();
      const status: MessageStatus = 'sending';

      dispatch({
        type: 'APPEND_MESSAGE',
        userMsg: buildUserMessage(msgId, content, status),
        placeholder: buildPlaceholder(),
        truncateTo: messageIndex,
      });

      executeStream(content, chatIdRef.current, msgId, messageIndex);
    },
    [executeStream],
  );

  const regenerate = useCallback(() => {
    const msgs = messagesRef.current;
    let idx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    sendEdit(msgs[idx].content, idx);
  }, [sendEdit]);

  const disconnect = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    dispatch({ type: 'RESET' });
    dispatch({ type: 'CONNECTED' });
    chatIdRef.current = null;
  }, []);

  const startNewChat = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const loadChat = useCallback(
    async (targetChatId: string) => {
      const gen = ++loadGenRef.current;
      const genSnapshot = getAuthSession().generation;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      dispatch({ type: 'DISCONNECTED' });
      dispatch({ type: 'LOAD_MESSAGES', messages: [] });

      try {
        const chat = await api.get(`/chats/${targetChatId}`, chatResponseSchema);
        if (loadGenRef.current !== gen || genSnapshot !== getAuthSession().generation) return;
        if (chat?.messages) {
          const loadedMessages: ChatMessage[] = chat.messages.map(
            (m: { role: string; content: string; created_at: string }) => ({
              id: crypto.randomUUID(),
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: new Date(m.created_at).getTime(),
            }),
          );
          dispatch({ type: 'LOAD_MESSAGES', messages: loadedMessages });
          dispatch({ type: 'CONTEXT_LOADED', chatId: targetChatId });
          dispatch({ type: 'CONNECTED' });
          chatIdRef.current = targetChatId;
        }
      } catch {
        if (loadGenRef.current !== gen || genSnapshot !== getAuthSession().generation) return;
        dispatch({ type: 'FAILED', error: 'Failed to load chat' });
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    chatId: state.chatId,
    messages: state.messages,
    connectionState: state.connectionState,
    isStreaming: state.isStreaming,
    isContextLoaded: state.isContextLoaded,
    error: state.error,
    resumed: state.resumed,
    sendMessage,
    sendEdit,
    stopStreaming,
    regenerate,
    disconnect,
    startNewChat,
    loadChat,
  };
}
