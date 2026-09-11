import { EventEmitter } from 'events';

export const statusEmitter = new EventEmitter();
statusEmitter.setMaxListeners(100);

// In-memory ring buffer for the last 50 status changes
const recentStatusEvents = [];

export function recordStatusEvent(eventData) {
  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...eventData
  };
  recentStatusEvents.unshift(event);
  if (recentStatusEvents.length > 50) {
    recentStatusEvents.pop();
  }
  try {
    statusEmitter.emit('status-change', event);
  } catch (err) {
    console.error('Status event emit error:', err);
  }
  return event;
}

export function getRecentStatusEvents(assessorId = null, sinceTimestamp = null) {
  let events = [...recentStatusEvents];
  if (assessorId) {
    const aid = String(assessorId).trim().toLowerCase();
    events = events.filter(e => {
      const eAssessorId = String(e.assessorId || '').trim().toLowerCase();
      const eAssessorName = String(e.assessorName || '').trim().toLowerCase();
      return eAssessorId === aid || eAssessorName === aid;
    });
  }
  if (sinceTimestamp) {
    const sinceTime = new Date(sinceTimestamp).getTime();
    if (!isNaN(sinceTime)) {
      events = events.filter(e => new Date(e.timestamp).getTime() > sinceTime);
    }
  }
  return events;
}
