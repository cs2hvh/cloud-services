'use client';

import { useState, useEffect, useRef, use } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  User,
  Send,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Settings,
  Copy,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model_id: string;
  status: 'active' | 'paused' | 'deleted';
  endpoint_id: string;
}

export default function PlaygroundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = createClient();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadAgent = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch(`/api/ai-agents/${id}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

      if (!res.ok) {
        throw new Error('Failed to load agent');
      }

      const data = await res.json();
      setAgent(data.data);
    } catch (err) {
      console.error('Failed to load agent:', err);
      toast.error('Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !agent || sending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantMessageId = crypto.randomUUID();

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    // Add empty assistant message that we'll stream into
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch(`/api/ai-agents/${id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage.content,
          stream: true,
          ...(conversationId && { conversation_id: conversationId }),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get response');
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let fullContent = '';
      let chunkCount = 0;
      const streamStartTime = Date.now();
      console.log('[Playground] Starting to read stream...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(`[Playground] Stream complete. Total chunks: ${chunkCount}, Duration: ${Date.now() - streamStartTime}ms`);
          break;
        }

        chunkCount++;
        if (chunkCount === 1) {
          console.log(`[Playground] First chunk received at: ${Date.now() - streamStartTime}ms`);
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'content') {
                fullContent += parsed.content;
                // Update the assistant message with new content
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                );
              } else if (parsed.type === 'done') {
                if (parsed.conversation_id) {
                  setConversationId(parsed.conversation_id);
                }
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error);
              }
            } catch {
              // Ignore JSON parse errors for incomplete chunks
              if (data && data !== '[DONE]') {
                console.debug('Skipping non-JSON chunk:', data);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to get response');

      // Update assistant message with error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: 'Sorry, I encountered an error processing your message.' }
            : msg
        )
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setConversationId(null);
    toast.success('Conversation reset');
  };

  const copyEndpoint = async () => {
    if (!agent) return;
    const url = `${window.location.origin}/api/v1/agents/${agent.endpoint_id}/chat`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Endpoint URL copied');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const getModelDisplayName = (model: string) => {
    const modelNames: Record<string, string> = {
      'openai/gpt-4o': 'GPT-4o',
      'openai/gpt-4o-mini': 'GPT-4o Mini',
      'openai/gpt-4-turbo': 'GPT-4 Turbo',
      'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
      'anthropic/claude-3-opus': 'Claude 3 Opus',
      'anthropic/claude-3-haiku': 'Claude 3 Haiku',
      'meta-llama/llama-3.1-70b-instruct': 'Llama 3.1 70B',
      'meta-llama/llama-3.1-8b-instruct': 'Llama 3.1 8B',
      'mistralai/mistral-large': 'Mistral Large',
      'google/gemini-pro-1.5': 'Gemini Pro 1.5',
      'deepseek/deepseek-chat': 'DeepSeek Chat',
    };
    return modelNames[model] || model;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-400">Agent not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 h-[calc(100vh-4rem)] flex flex-col max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/dashboard/services/ai-agents/${id}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{agent.name}</h1>
              <Badge variant="outline" className="text-xs">
                {getModelDisplayName(agent.model_id)}
              </Badge>
            </div>
            <p className="text-sm text-slate-400">Playground - Test your agent</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetConversation}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={copyEndpoint}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Endpoint
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/services/ai-agents/${id}`}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col bg-slate-900/30 border-slate-800 overflow-hidden">
        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="p-4 rounded-full bg-blue-500/10 mb-4">
                <Sparkles className="h-8 w-8 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Start a conversation</h3>
              <p className="text-slate-400 max-w-md">
                Send a message to test your agent. The conversation will use your agent&apos;s
                system prompt and knowledge base (if configured).
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-blue-400" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[80%] rounded-lg px-4 py-2',
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-100'
                    )}
                  >
                    {message.role === 'assistant' && message.content === '' && sending ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        <span className="text-slate-400 text-sm">Thinking...</span>
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <p
                          className={cn(
                            'text-xs mt-1',
                            message.role === 'user' ? 'text-blue-200' : 'text-slate-500'
                          )}
                        >
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                      <User className="h-4 w-4 text-slate-300" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              disabled={sending || agent.status !== 'active'}
              className="flex-1 bg-slate-800 border-slate-700"
            />
            <Button onClick={sendMessage} disabled={sending || !input.trim() || agent.status !== 'active'}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {agent.status !== 'active' && (
            <p className="text-sm text-yellow-400 mt-2">
              This agent is disabled. Enable it in settings to test.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
