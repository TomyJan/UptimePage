import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { TransitionLink } from '../../components/TransitionLink.tsx';
import { usePrivacyCopy } from './copy.ts';

export function PrivacyPage() {
  const copy = usePrivacyCopy();
  return (
    <article className="privacy-page" aria-labelledby="privacy-title">
      <TransitionLink className="back" to="/">
        <ArrowLeft size={15} aria-hidden="true" /> {copy.back}
      </TransitionLink>
      <header className="privacy-heading">
        <span className="privacy-mark">
          <ShieldCheck size={25} aria-hidden="true" />
        </span>
        <h1 id="privacy-title">{copy.title}</h1>
        <p>{copy.introduction}</p>
        <span className="privacy-updated">{copy.updated}</span>
      </header>
      <div className="privacy-content">
        {copy.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
