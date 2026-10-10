import { OperationsStore } from './store.js';
import { DeliveryError, TelegramClient } from './telegram.js';
import type { EventApplicationService } from '../core/event-application-service.js';

export async function tick(store: OperationsStore,telegram: TelegramClient,service: EventApplicationService,now = new Date()) {
  store.recover(now);
  const reminder = store.claim(now);
  if (!reminder) return false;
  try {
    let text = reminder.message;
    if (reminder.event_id) store.authorize(reminder.owner,reminder.event_id);
    if (reminder.kind === 'progress') {
      const result = await service.getSummary(reminder.event_id!);
      if (!result.ok) throw new Error('Event unavailable');
      const pending = result.value.tasks.filter(task => task.status !== 'completed');
      text = `${reminder.message}\n${result.value.event.workflow.request.title}\n${pending.length} pending tasks:\n${pending.map(task => `${task.title}: ${task.status}`).join('\n')}`.slice(0,4000);
    }
    const evidence = await telegram.sendMessage(reminder.chat_id,text);
    store.finish(reminder,{evidence},now);
  } catch(error) {
    store.finish(reminder,error instanceof DeliveryError
      ? {error:error.message,uncertain:error.kind==='uncertain',retryAfter:error.retryAfter}
      : {error:'internal_delivery_failure'},now);
  }
  return true;
}
