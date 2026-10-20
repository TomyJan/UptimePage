import { useGroupQuery } from '../../data/hooks.ts';
import { publicConfig } from '../../data/config.ts';
import { useCopy } from '../preferences/copy.ts';
import { RefreshControl } from '../refresh/RefreshControl.tsx';
export function StatusPage(){const t=useCopy(),id=publicConfig.groups[0].id,q=useGroupQuery(id);return <section className="intro"><h1>{t('title')}</h1><RefreshControl fetchedAt={q.data?.fetchedAt??null} identity={id} refresh={async()=>{const result=await q.refetch();if(result.error)throw result.error}}/></section>}
