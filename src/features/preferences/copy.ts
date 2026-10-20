import { usePreferences } from './store.ts';
const en={
 title:'Service status',language:'Language',timezone:'Timezone',appearance:'Appearance',auto:'Automatic',light:'Light',dark:'Dark',all:'All',groups:'Groups',subgroups:'Subgroups',search:'Search services',
 operational:'Operational',down:'Down',pending:'Retrying',maintenance:'Maintenance',paused:'Paused',unknown:'Unknown',stale:'Update delayed',unavailable:'Unavailable',partial:'Partial coverage','no-data':'No data',
 healthy:'All systems operational',some:'Service disruption',uncertain:'Status unconfirmed',normalCount:'Operational',faultCount:'Down',otherCount:'Other',pin:'Issues first',
 history:'24 hours',uptime:'Uptime',response:'Response',updated:'Updated',refresh:'Refresh now',refreshing:'Refreshing',refreshSettings:'Refresh interval',siteDefault:'Site default',manual:'Manual only',every30:'Every 30s',every60:'Every minute',every300:'Every 5 min',refreshDone:'Refreshed',refreshFailed:'Refresh failed',
 empty:'No services',noResults:'No matching services',loadError:'Unable to load',retry:'Retry',partialError:'Some groups are unavailable',staleNote:'Data is outdated. Current status is unconfirmed.',
 back:'Back',notFound:'Service unavailable',periodUptime:'24h uptime',latestResponse:'Latest response',average:'24h average response',certificate:'Certificate remaining',days:'days',checks:'Checks',events:'Recent events',information:'Service information',type:'Type',interval:'Check interval',source:'Source',lastCheck:'Last check',unsupported:'Not supported',noData:'No data',noEvents:'No incidents in available history',lastKnown:'Last known value',period:'Last 24 hours',provider:'Provider statistics',samples:'Observed samples',coverage:'Coverage',now:'Now',ago:'24 hours ago',dismiss:'Dismiss notification',notifications:'Notifications',top:'Back to top',skip:'Skip to content',seconds:'s',focusHistory:'Use arrow keys to explore history',
};
const zh:typeof en={
 title:'服务状态',language:'语言',timezone:'时区',appearance:'外观',auto:'自动',light:'浅色',dark:'深色',all:'全部',groups:'分组',subgroups:'子分组',search:'搜索服务',
 operational:'正常',down:'故障',pending:'重试中',maintenance:'维护',paused:'暂停',unknown:'未知',stale:'更新延迟',unavailable:'不可用',partial:'部分覆盖','no-data':'无数据',
 healthy:'全部运行正常',some:'部分服务异常',uncertain:'当前状态待确认',normalCount:'正常',faultCount:'故障',otherCount:'其他',pin:'异常优先',history:'24 小时',uptime:'可用率',response:'响应',updated:'更新于',refresh:'立即刷新',refreshing:'刷新中',refreshSettings:'刷新频率',siteDefault:'跟随站点',manual:'仅手动',every30:'每 30 秒',every60:'每分钟',every300:'每 5 分钟',refreshDone:'已刷新',refreshFailed:'刷新失败',
 empty:'暂无服务',noResults:'没有匹配的服务',loadError:'获取失败',retry:'重试',partialError:'部分分组获取失败',staleNote:'数据已过期，当前状态待确认。',back:'返回',notFound:'服务不可用',periodUptime:'24h 可用率',latestResponse:'最新响应',average:'24h 平均响应',certificate:'证书剩余时间',days:'天',checks:'检查记录',events:'近期事件',information:'服务信息',type:'类型',interval:'检查周期',source:'来源',lastCheck:'最后检查',unsupported:'不支持',noData:'暂无数据',noEvents:'已提供的历史中无故障',lastKnown:'上次已知值',period:'最近 24 小时',provider:'来源统计',samples:'实际采样',coverage:'覆盖范围',now:'现在',ago:'24 小时前',dismiss:'关闭通知',notifications:'通知',top:'回到顶部',skip:'跳到主要内容',seconds:'秒',focusHistory:'左右键查看历史',
};
export type CopyKey=keyof typeof en;
export function useCopy(){const {locale}=usePreferences();return (key:CopyKey)=>(locale==='zh-CN'?zh:en)[key]}
