import { DOMParser as LinkedomDOMParser } from 'linkedom'

/**
 * Popup / Options 有浏览器原生 DOMParser；MV3 service worker 无，用 linkedom 解析参数页 HTML。
 */
export function parseHtmlToDocument(html: string): Document {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(html, 'text/html')
  }
  return new LinkedomDOMParser().parseFromString(html, 'text/html') as unknown as Document
}
