import { useEffect } from 'react';

type SeoProps = {
  title: string;
  description: string;
  path?: string;
  structuredData?: Record<string, unknown>;
};

function setMeta(selector: string, attributes: Record<string, string>) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    document.head.appendChild(tag);
  }
  Object.entries(attributes).forEach(([name, value]) => {
    tag!.setAttribute(name, value);
  });
}

function setLink(rel: string, href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = rel;
    document.head.appendChild(tag);
  }
  tag.href = href;
}

export function Seo({ title, description, path = '/', structuredData }: SeoProps) {
  useEffect(() => {
    const url = new URL(path, window.location.origin).toString();
    document.title = title;
    setMeta('meta[name="description"]', { name: 'description', content: description });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: url });
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
    setLink('canonical', url);

    const id = 'se-structured-data';
    document.getElementById(id)?.remove();
    if (structuredData) {
      const script = document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      script.text = JSON.stringify({ ...structuredData, url });
      document.head.appendChild(script);
    }
  }, [description, path, structuredData, title]);

  return null;
}
