export type ErrorAction = 'login' | 'retry' | 'back' | 'dashboard' | 'none';

export interface TrackScoreError {
  status?: number;
  code?: string;
  title: string;
  message: string;
  retryable: boolean;
  action?: ErrorAction;
}

