// PNG rendering for Amara's text cards (resvg in WebAssembly, Inter font).
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { buildCardSvg } from "./card.ts";
let ready: Promise<Uint8Array[]> | null = null;
export async function renderCard(card: any): Promise<Uint8Array> {
  if (!ready) ready = (async () => {
    await initWasm(fetch("https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
    return await Promise.all(["Inter_400Regular", "Inter_500Medium", "Inter_700Bold"].map(async (f) => new Uint8Array(await (await fetch(`https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/${f}.ttf`)).arrayBuffer())));
  })();
  const fonts = await ready;
  return new Resvg(buildCardSvg(card), { font: { fontBuffers: fonts, defaultFontFamily: "Inter", loadSystemFonts: false } }).render().asPng();
}
