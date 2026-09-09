import { h } from "./dom";
import { ikon } from "./icons";

let alan: HTMLElement | null = null;

function kap(): HTMLElement {
  if (!alan) {
    alan = h("div", { sinif: "tost-alan" });
    document.body.append(alan);
  }
  return alan;
}

const IKON = { bilgi: "saat", iyi: "onay", hata: "uyari" } as const;

export function tost(
  mesaj: string,
  tur: "bilgi" | "iyi" | "hata" = "bilgi",
  sure = 3200,
): void {
  const e = h(
    "div",
    { sinif: `tost ${tur}` },
    ikon(IKON[tur], 15),
    h("span", { metin: mesaj }),
  );
  kap().append(e);
  setTimeout(() => {
    e.style.transition = "opacity 200ms, transform 200ms";
    e.style.opacity = "0";
    e.style.transform = "translateX(12px)";
    setTimeout(() => e.remove(), 220);
  }, sure);
}
