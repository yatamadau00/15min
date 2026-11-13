import type {RecordItem} from './tracking.ts';
// Server-owned intervals are never sent back for memo/deletion edits.
export function itemPayload(item: RecordItem) {
  if (item.kind === 'session' && (item.source === 'timer' || item.source === 'legacy')) {
    return {id:item.id,kind:'session',memo:item.memo||'',deleted:!!item.deleted};
  }
  return item;
}
