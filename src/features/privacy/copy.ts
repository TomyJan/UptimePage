import { usePreferences } from '../preferences/store.ts';

const en = {
  title: 'Privacy policy',
  navigation: 'Legal information',
  back: 'Back to status',
  updated: 'Last updated: October 30, 2026',
  introduction: 'How this website handles information when you visit.',
  noticeTitle: 'Cookie & privacy',
  noticeBody: 'We remember your browsing preferences and may use visitor statistics.',
  noticePolicyLead: 'See our ',
  noticePolicyEnd: '.',
  acknowledge: 'Got it',
  sections: [
    {
      title: 'About this policy',
      body: 'This policy applies to the public status pages on this website. Viewing these pages does not require an account or the submission of identity information.',
    },
    {
      title: 'Information we use',
      body: 'To deliver the website, maintain security and resolve problems, the website and its service providers may process basic visit, device and network information. Information is used within the scope and for the period needed for these purposes and applicable legal obligations.',
    },
    {
      title: 'Cookies and browsing preferences',
      body: 'Necessary browser storage remembers your browsing preferences and whether you have acknowledged this notice. You can clear this information through your browser settings. Doing so resets those preferences and may show the notice again. Services supporting the website may also use cookies or similar mechanisms for essential operation and security.',
    },
    {
      title: 'Visitor statistics',
      body: 'If enabled, visitor statistics help us understand traffic and page usage so we can improve the website. They are not used for personalized advertising. Acknowledging the notice only closes the message; it does not change whether statistics are enabled or replace consent where consent is required.',
    },
    {
      title: 'Service providers and external links',
      body: 'Hosting, content delivery and optional statistics may be supported by service providers, which handle information under their applicable policies. External websites linked from this website have their own privacy policies.',
    },
    {
      title: 'Your choices and policy updates',
      body: 'You can manage privacy and stored information through your browser. Limiting necessary storage may prevent some preferences from being remembered. For privacy questions or requests under applicable law, contact the website operator through their published contact channels. This policy may be updated as the website changes; the current version is available on this page.',
    },
  ],
};

const zh: typeof en = {
  title: '隐私政策',
  navigation: '法律信息',
  back: '返回状态页',
  updated: '更新日期：2026 年 10 月 30 日',
  introduction: '了解本站在您访问时如何处理信息。',
  noticeTitle: 'Cookie 与隐私',
  noticeBody: '本站会记住您的浏览偏好，并可能使用访问统计。',
  noticePolicyLead: '详见',
  noticePolicyEnd: '。',
  acknowledge: '知道了',
  sections: [
    {
      title: '适用范围',
      body: '本政策适用于本站的公开状态页面及相关内容。浏览这些页面无需注册账户，也无需主动提交身份信息。',
    },
    {
      title: '信息的使用',
      body: '为提供页面、保障访问安全及排查故障，本站及其服务提供方可能处理基本的访问、设备与网络信息。相关信息仅在实现上述目的及履行适用法律义务所需的范围和期限内使用。',
    },
    {
      title: 'Cookie 与浏览偏好',
      body: '本站通过必要的浏览器存储记住您的浏览偏好及本提示的确认状态。您可以在浏览器设置中清除这些信息；清除后，相应偏好会重置，提示可能再次出现。支持本站运行的服务也可能使用 Cookie 或类似机制，维持基本运行与访问安全。',
    },
    {
      title: '访问统计',
      body: '如启用访问统计，相关信息用于了解访问量与页面使用情况，帮助改进网站，不用于个性化广告。确认提示仅表示关闭该提示，不改变统计的启用状态，也不替代依法需要另行取得的同意。',
    },
    {
      title: '服务提供方与外部链接',
      body: '网站托管、内容交付及可选的访问统计可能由服务提供方支持，其信息处理适用相应的隐私政策。通过本站链接访问其他网站时，请查阅相关网站的隐私政策。',
    },
    {
      title: '您的选择与政策更新',
      body: '您可以通过浏览器管理隐私与已保存的信息。限制必要存储可能使部分偏好无法保留。如有隐私疑问或需依法行使相关权利，请通过网站运营者公开的联系渠道提出。本政策可能随网站服务变化而更新，最新版本会在本页公布。',
    },
  ],
};

export function usePrivacyCopy() {
  const { locale } = usePreferences();
  return locale === 'zh-CN' ? zh : en;
}
