import type { FormEventHandler, HTMLAttributes, ReactNode } from 'react';

type Props = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'div' | 'form' | 'section';
  media?: string | null;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
};

export function Card({ as: Tag = 'article', media, className, children, ...props }: Props) {
  const extra = className ? ` ${className}` : '';
  return (
    <Tag className={`card${media !== undefined ? ' card-media' : ''}${extra}`} {...props}>
      {media !== undefined ? (
        <div className="card-media-slot" aria-hidden="true">
          <span>{(media || '?').slice(0, 1).toUpperCase()}</span>
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </Tag>
  );
}
