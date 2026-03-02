import { settings } from '@/config/settings';

export interface NotifyPayload {
  title: string;
  message: string;
  tags?: string[];
  priority?: 'default' | 'low' | 'high' | 'urgent';
}

const priorityMap: Record<NonNullable<NotifyPayload['priority']>, string> = {
  default: '3',
  low: '2',
  high: '4',
  urgent: '5'
};

export async function publishNtfy(gameId: string, payload: NotifyPayload): Promise<void> {
  const topic = `${settings.ntfyTopicPrefix}-${gameId}`;

  await fetch(`${settings.ntfyBaseUrl}/${topic}`, {
    method: 'POST',
    headers: {
      Title: payload.title,
      Priority: priorityMap[payload.priority ?? 'default'],
      Tags: payload.tags?.join(',') ?? 'game'
    },
    body: payload.message
  });
}
