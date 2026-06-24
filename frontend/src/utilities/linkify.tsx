import type { ReactNode } from 'react';

const URL_REGEX = /https?:\/\/\S+/g;

export function linkify(text: string): ReactNode {
  // split() gives the text segments between URLs; match() gives the URLs themselves.
  // They always interleave: [text, url, text, url, ..., text] (parts.length === urls.length + 1).
  const parts = text.split(URL_REGEX);
  const urls = text.match(URL_REGEX) ?? [];
  return parts.map((part, i) =>
    urls[i]
      ? [
          part,
          <a key={i} href={urls[i]} target="_blank" rel="noopener noreferrer">
            {urls[i]}
          </a>,
        ]
      : [part],
  );
}
