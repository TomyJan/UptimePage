import {ArrowUp} from 'lucide-react';
import {useCopy} from '../preferences/copy.ts';
export function BackToTop({visible,onClick}:{visible:boolean;onClick:()=>void}){const t=useCopy();return <button className={`back-top ${visible?'is-visible':''}`} type="button" aria-label={t('top')} aria-hidden={!visible} inert={!visible} tabIndex={visible?0:-1} onClick={onClick}><ArrowUp size={20}/></button>}
