import type { ReactNode } from 'react';

const Link = ({ href, children }: { href: string; children: ReactNode }) => {
  return <a href={href}>{children}</a>;
};

export default Link;
