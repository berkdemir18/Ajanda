type Cocuk = Node | string | number | null | undefined | false;

interface Ozellik {
  sinif?: string;
  metin?: string;
  html?: string;
  stil?: Partial<CSSStyleDeclaration> & Record<string, string>;
  attr?: Record<string, string | number | boolean | null>;
  tikla?: (e: MouseEvent) => void;
  [k: string]: unknown;
}

/** Küçük DOM kurucusu — çerçeve yerine bu yeterli. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  ozellik?: Ozellik | null,
  ...cocuklar: Cocuk[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (ozellik) {
    for (const [k, v] of Object.entries(ozellik)) {
      if (v === undefined || v === null) continue;
      if (k === "sinif") e.className = String(v);
      else if (k === "metin") e.textContent = String(v);
      else if (k === "html") e.innerHTML = String(v);
      else if (k === "tikla") e.addEventListener("click", v as EventListener);
      else if (k === "stil") {
        for (const [sk, sv] of Object.entries(v as Record<string, string>)) {
          if (sk.startsWith("--")) e.style.setProperty(sk, sv);
          else (e.style as unknown as Record<string, string>)[sk] = sv;
        }
      } else if (k === "attr") {
        for (const [ak, av] of Object.entries(v as Record<string, unknown>)) {
          if (av === false || av === null || av === undefined) continue;
          e.setAttribute(ak, String(av));
        }
      } else if (k.startsWith("on") && typeof v === "function") {
        e.addEventListener(k.slice(2), v as EventListener);
      } else {
        (e as unknown as Record<string, unknown>)[k] = v;
      }
    }
  }
  for (const c of cocuklar) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : String(c));
  }
  return e;
}

/** null/false çocukları eleyerek ekler — h() ile aynı gevşeklik. */
export function ekle(kap: HTMLElement, ...cocuklar: Cocuk[]): HTMLElement {
  for (const c of cocuklar) {
    if (c === null || c === undefined || c === false) continue;
    kap.append(c instanceof Node ? c : String(c));
  }
  return kap;
}

export function bosalt(e: HTMLElement): HTMLElement {
  e.replaceChildren();
  return e;
}

export function sec<T extends HTMLElement>(q: string, kok: ParentNode = document): T {
  const e = kok.querySelector<T>(q);
  if (!e) throw new Error(`bulunamadi: ${q}`);
  return e;
}
