import type { MonitorDetail } from '../../shared/contracts.ts';
import { ArrowRight, CircleCheck, Clock3 } from 'lucide-react';
import { AnimatedHeight } from '../../components/AnimatedHeight.tsx';
import { useCopy } from '../preferences/copy.ts';
import { useFormatTime } from '../status/HistoryBars.tsx';
export function MonitorEvents({ detail: d }: { detail: MonitorDetail }) {
  const t = useCopy(),
    time = useFormatTime();
  return (
    <section className="panel events-panel">
      <div className="panel-top">
        <h2>{t('events')}</h2>
      </div>
      <AnimatedHeight
        className="events-content"
        contentKey={`${d.capabilities.events}:${d.events.length > 0}`}
      >
        {d.capabilities.events !== 'available' ? (
          <div className="events-empty">
            <span className="events-empty-icon">
              <Clock3 size={20} strokeWidth={1.6} />
            </span>
            <p>{t(d.capabilities.events === 'unsupported' ? 'unsupported' : 'noData')}</p>
          </div>
        ) : d.events.length ? (
          <ol className="event-list" aria-label={t('events')}>
            {d.events
              .toSorted((a, b) => Date.parse(b.from) - Date.parse(a.from))
              .map((e) => (
                <li className="event" data-state={e.state} key={e.id}>
                  <span className="event-marker" aria-hidden="true" />
                  <div className="event-body">
                    <div className="event-heading">
                      <strong>{t(e.state)}</strong>
                      <span className="event-phase" data-ongoing={!e.until}>
                        {t(e.until ? 'ended' : 'ongoing')}
                      </span>
                    </div>
                    <div className="event-time">
                      <time dateTime={e.from}>{time(e.from, true)}</time>
                      {e.until && (
                        <>
                          <ArrowRight size={12} aria-hidden="true" />
                          <time dateTime={e.until}>{time(e.until, true)}</time>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
          </ol>
        ) : (
          <div className="events-empty is-clear">
            <span className="events-empty-icon">
              <CircleCheck size={22} strokeWidth={1.6} />
            </span>
            <p>{t('noEvents')}</p>
          </div>
        )}
      </AnimatedHeight>
    </section>
  );
}
