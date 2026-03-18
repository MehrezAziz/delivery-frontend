import { api } from './client';

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

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: 'USER' | 'CUSTOMER_SERVICE';
  content: string;
  image: string | null;
  timestamp: string;
  readAt: string | null;
}

export const supportService = {
  createTicket: (data: { category: string; priority: string; description: string }) =>
    api.post<SupportTicket>('/support/tickets', data),

  getMyTickets: () =>
    api.get<SupportTicket[]>('/support/tickets'),

  getTicket: (id: string) =>
    api.get<SupportTicket & { messages: SupportMessage[] }>(`/support/tickets/${id}`),

  sendMessage: (ticketId: string, content: string, image?: string) =>
    api.post<SupportMessage>(`/support/tickets/${ticketId}/messages`, { content, image }),

  markRead: (ticketId: string) =>
    api.patch(`/support/tickets/${ticketId}/read`),
};
