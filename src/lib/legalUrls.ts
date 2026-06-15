const BASE = 'https://jsantacgdev.github.io/metal-radar-legal';

export function privacyUrl(lang: string): string {
  return lang.startsWith('en') ? `${BASE}/privacy-en.html` : `${BASE}/privacy-es.html`;
}

export function termsUrl(lang: string): string {
  return lang.startsWith('en') ? `${BASE}/terms-en.html` : `${BASE}/terms-es.html`;
}
