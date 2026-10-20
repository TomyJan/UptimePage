import {expect,it} from 'vitest';
import {buildHistorySegments,formatMetric} from '../../src/features/status/history.ts';
it('retains uncovered portions instead of stretching samples across a day',()=>{
 const segments=buildHistorySegments([{from:'2026-10-21T00:10:00Z',until:'2026-10-21T00:20:00Z',state:'operational',responseMs:0}],'2026-10-21T00:00:00Z','2026-10-21T01:00:00Z');
 expect(segments.map(s=>[s.state,s.duration])).toEqual([['no-data',600000],['operational',600000],['no-data',2400000]]);
 expect(segments[1].responseMs).toBe(0);
});
it('clips to the real window and distinguishes zero from missing',()=>{
 expect(buildHistorySegments([],'2026-10-21T00:00:00Z','2026-10-22T00:00:00Z')[0].state).toBe('no-data');
 expect(formatMetric(0,'%')).toBe('0%');expect(formatMetric(null,'%')).toBe('—');
});
