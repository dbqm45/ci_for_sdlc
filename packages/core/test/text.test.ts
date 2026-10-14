import { describe, expect, it } from 'vitest';
import { htmlToText } from '../src/index.js';

// Confluence storage format writes typographic characters as named entities (`—` comes back as `&mdash;`).
describe('htmlToText: entities', () => {
  it.each([
    { id: 'named', html: '<p>POST /payments &mdash; creates a charge</p>', expected: 'POST /payments — creates a charge' },
    { id: 'typographic', html: '<p>&bdquo;tak&rdquo; &ndash; 5&nbsp;z&#322; &hellip; &rsquo;</p>', expected: '„tak” – 5 zł … ’' },
    { id: 'basic', html: '<p>a &lt;b&gt; &amp; &quot;c&quot; &#39;d&#39;</p>', expected: 'a <b> & "c" \'d\'' },
    { id: 'numeric', html: '<p>&#8212; &#x2014; &#X2014;</p>', expected: '— — —' },
    { id: 'decoded once', html: '<p>&amp;lt;p&amp;gt; &amp;mdash;</p>', expected: '&lt;p&gt; &mdash;' },
    { id: 'unknown kept', html: '<p>&bogus; &#xZZ; &#99999999;</p>', expected: '&bogus; &#xZZ; &#99999999;' },
  ])('$id', ({ html, expected }) => {
    expect(htmlToText(html)).toBe(expected);
  });
});
