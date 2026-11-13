import { z } from 'zod';
const segment = z.object({start:z.number().finite().nonnegative(), end:z.number().finite().nonnegative()});
const schema = z.object({
 id:z.string().regex(/^[-\w]{1,80}$/).refine(id=>id!=='shared-timer'),
 kind:z.enum(['task','event','session','category']),title:z.string().trim().min(1).max(300),
 date:z.string().max(10).refine(v=>v===''||/^\d{4}-\d{2}-\d{2}$/.test(v)),time:z.string().max(5).refine(v=>v===''||/^\d{2}:\d{2}$/.test(v)),done:z.boolean(),priority:z.enum(['normal','high']),
 categoryId:z.preprocess(v=>v===''?undefined:v,z.string().regex(/^[-\w]{1,80}$/).optional()),memo:z.string().max(2000).optional(),
 // Older timer UPSERTs stored SQLite's numeric booleans. Accept only 0/1 for compatibility.
 deleted:z.preprocess(v=>v===0?false:v===1?true:v,z.boolean().optional()),
 source:z.enum(['manual','timer','legacy']).optional(),segments:z.array(segment).max(100).optional(),timezone:z.literal('Asia/Tokyo').optional(),
});
export function validateItem(input: unknown, old?: Record<string, any>, now = Date.now()): Record<string, any> {
 const value = schema.parse(input);
 if (old && old.kind !== value.kind && !(['task','event'].includes(old.kind)&&['task','event'].includes(value.kind))) throw Error('種類は変更できません');
 if (value.kind !== 'session') return value;
 if (old?.source === 'timer' || old?.source === 'legacy') return {...old, memo:value.memo||'', deleted:!!old.deleted||value.deleted===true};
 if (value.source !== 'manual' || !value.segments || value.segments.length !== 1) throw Error('手動実績が必要です');
 const {start,end} = value.segments[0];
 if (end <= start || end > now || end > 8640000000000000) throw Error('開始・終了を確認してください');
 return {...value, minutes:(end-start)/60000};
}
