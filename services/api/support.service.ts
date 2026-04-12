import { Platform } from 'react-native';
import { api, getAuthToken } from './client';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export interface SupportTicket {
  id: string;
  userId: string;
  assignedTo: string | null;
  category: string;
  priority: string;
  status: string;
  description: string;
  createdAt: string;
  resolvedAt: string | null;
  customerService?: { superUser: { pseudo: string } } | null;
  messages?: SupportMessage[];
  user?: { id: string; firstName: string; secondName: string; role: string };
}

export type SupportSenderType = 'USER' | 'CUSTOMER_SERVICE' | 'BOT';

export interface BotMessageMetadata {
  helpfulnessPrompt?: boolean;
  citations?: string[];
  model?: string;
  groq?: boolean;
  error?: boolean;
  escalationReason?: 'human_intent' | 'sensitive_topic';
  trackRecommendation?: {
    orderId: string;
    showTrackButton: boolean;
    driverTrackable: boolean;
  };
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: SupportSenderType;
  content: string;
  image: string | null;
  timestamp: string;
  readAt: string | null;
  metadata?: BotMessageMetadata | null;
}

export interface SendMessageResponse {
  message: SupportMessage;
  botMessage: SupportMessage | null;
}

export const supportService = {
  createTicket: (data: { category: string; priority: string; description: string }) =>
    api.post<SupportTicket>('/support/tickets', data),

  getMyTickets: () => api.get<SupportTicket[]>('/support/tickets'),

  getTicket: (id: string) =>
    api.get<SupportTicket & { messages: SupportMessage[] }>(`/support/tickets/${id}`),

  sendMessage: (ticketId: string, content: string, image?: string) =>
    api.post<SendMessageResponse>(`/support/tickets/${ticketId}/messages`, { content, image }),

  /** Run AI on the latest user message without inserting another user row (after failed SSE read). */
  aiFollowup: (ticketId: string) =>
    api.post<{ botMessage: SupportMessage | null }>(`/support/tickets/${ticketId}/ai-followup`, {}),

  markRead: (ticketId: string) => api.patch(`/support/tickets/${ticketId}/read`),

  submitAiFeedback: (ticketId: string, messageId: string, helpful: boolean) =>
    api.post<{ success: boolean }>(`/support/tickets/${ticketId}/ai-feedback`, {
      messageId,
      helpful,
    }),
};

export type StreamCallbacks = {
  onUserMessage?: (message: SupportMessage) => void;
  onChunk?: (text: string) => void;
  onDone?: (botMessage: SupportMessage | null) => void;
};

function parseSseEventBlock(block: string, callbacks: StreamCallbacks) {
  let eventName = 'message';
  let dataStr = '';
  for (const line of block.split('\n')) {
    const t = line.replace(/\r$/, '');
    if (t.startsWith('event:')) eventName = t.slice(6).trim();
    if (t.startsWith('data:')) dataStr = t.slice(5).trim();
  }
  if (!dataStr) return;
  try {
    const data = JSON.parse(dataStr) as Record<string, unknown>;
    if (eventName === 'user_message' && data.message) {
      callbacks.onUserMessage?.(data.message as SupportMessage);
    } else if (eventName === 'chunk' && typeof data.text === 'string') {
      callbacks.onChunk?.(data.text);
    } else if (eventName === 'done') {
      const bot = data.botMessage as SupportMessage | null | undefined;
      callbacks.onDone?.(bot ?? null);
    }
  } catch {
    /* skip */
  }
}

function feedSseBuffer(incoming: string, state: { buf: string }, callbacks: StreamCallbacks) {
  state.buf += incoming;
  let idx: number;
  while ((idx = state.buf.indexOf('\n\n')) >= 0) {
    const block = state.buf.slice(0, idx);
    state.buf = state.buf.slice(idx + 2);
    if (block.trim()) parseSseEventBlock(block, callbacks);
  }
}

async function readSseFromFetchReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamCallbacks,
) {
  const decoder = new TextDecoder();
  const state = { buf: '' };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    feedSseBuffer(decoder.decode(value, { stream: true }), state, callbacks);
  }
  if (state.buf.trim()) parseSseEventBlock(state.buf, callbacks);
}

async function sendSupportMessageStreamFetch(
  url: string,
  body: string,
  token: string | null,
  callbacks: StreamCallbacks,
) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  if (!res.ok) {
    let err: string = res.statusText;
    try {
      const j = (await res.json()) as { message?: string; error?: string };
      err = j.message || j.error || err;
    } catch {
      /* ignore */
    }
    throw new Error(err);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }
  await readSseFromFetchReader(reader, callbacks);
}

const STREAM_TIMEOUT_MS = 120_000;

function finishXhrSuccess(
  xhr: XMLHttpRequest,
  state: { buf: string },
  lastLenRef: { n: number },
  callbacks: StreamCallbacks,
  resolve: () => void,
  settledRef: { v: boolean },
) {
  if (settledRef.v) return;
  if (xhr.status > 0 && xhr.status < 400) {
    const full = xhr.responseText;
    const piece = full.slice(lastLenRef.n);
    lastLenRef.n = full.length;
    feedSseBuffer(piece, state, callbacks);
    if (state.buf.trim()) parseSseEventBlock(state.buf, callbacks);
  }
  settledRef.v = true;
  resolve();
}

function sendSupportMessageStreamXhr(
  url: string,
  body: string,
  token: string | null,
  callbacks: StreamCallbacks,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const state = { buf: '' };
    const lastLenRef = { n: 0 };
    const settledRef = { v: false };

    function failHttp() {
      if (settledRef.v) return;
      let err = xhr.statusText || 'Request failed';
      try {
        const j = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        err = j.message || j.error || err;
      } catch {
        if (xhr.responseText) err = xhr.responseText;
      }
      settledRef.v = true;
      reject(new Error(err));
    }

    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = STREAM_TIMEOUT_MS;

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4 && xhr.status >= 400 && !settledRef.v) {
        failHttp();
        return;
      }
      if ((xhr.readyState === 3 || xhr.readyState === 4) && xhr.status > 0 && xhr.status < 400) {
        const full = xhr.responseText;
        const piece = full.slice(lastLenRef.n);
        lastLenRef.n = full.length;
        feedSseBuffer(piece, state, callbacks);
      }
      if (xhr.readyState === 4 && xhr.status > 0 && xhr.status < 400 && !settledRef.v) {
        if (state.buf.trim()) parseSseEventBlock(state.buf, callbacks);
        settledRef.v = true;
        resolve();
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 400) {
        if (!settledRef.v) failHttp();
        return;
      }
      if (!settledRef.v) {
        finishXhrSuccess(xhr, state, lastLenRef, callbacks, resolve, settledRef);
      }
    };

    xhr.onerror = () => {
      if (!settledRef.v) {
        settledRef.v = true;
        reject(new Error('Network error'));
      }
    };

    xhr.ontimeout = () => {
      if (!settledRef.v) {
        settledRef.v = true;
        reject(new Error('Support stream timed out — try again.'));
      }
    };

    xhr.send(body);
  });
}

async function withStreamTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error('Support stream timed out — try again.')), ms),
    ),
  ]);
}

/**
 * SSE: events `user_message`, `chunk`, `done`.
 * React Native Android/iOS: `fetch` often has no `response.body` — use XMLHttpRequest for progressive SSE.
 */
export async function sendSupportMessageStream(
  ticketId: string,
  content: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const token = await getAuthToken();
  const url = `${API_BASE_URL}/support/tickets/${ticketId}/messages/stream`;
  const body = JSON.stringify({ content });

  if (Platform.OS === 'web') {
    await withStreamTimeout(sendSupportMessageStreamFetch(url, body, token, callbacks), STREAM_TIMEOUT_MS);
    return;
  }

  try {
    await withStreamTimeout(sendSupportMessageStreamXhr(url, body, token, callbacks), STREAM_TIMEOUT_MS);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}
