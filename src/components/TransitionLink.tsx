import {Link,useNavigate,type LinkProps} from 'react-router';
import {transition} from '../app/transitions.ts';
export function TransitionLink({onClick,to,state,...props}:LinkProps){const navigate=useNavigate();return <Link {...props} to={to} state={state} onClick={e=>{onClick?.(e);if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||props.target==='_blank')return;e.preventDefault();transition('page-content',()=>{void navigate(to,{state});scrollTo(0,0)})}}/>}
