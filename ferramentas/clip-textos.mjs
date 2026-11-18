// Gera extension/assets/clip-textos.json: as frases de cada categoria e a
// representação de cada uma pelo lado de texto do CLIP. Roda uma vez, no
// computador de quem desenvolve; a extensão só leva o resultado (o modelo de
// texto não vai para o navegador).
//
// Uso (fora do repositório, sem virar dependência):
//   mkdir tmp-clip && cd tmp-clip && npm init -y && npm i @huggingface/transformers@4.3.2
//   cp ../ferramentas/clip-textos.mjs . && node clip-textos.mjs ../extension/assets/clip-textos.json
import { writeFileSync } from 'node:fs';
import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers';

// mesmo modelo e revisão do lado da imagem (extension/src/core/clip.js)
const MODELO = 'Xenova/clip-vit-base-patch32';
const REVISAO = '6b7c523703ae26e39be4b03774966f8571c7f523';

export const FRASES = {
  pessoal: [
    'a photo of people', 'a family photo', 'a selfie', 'a group of friends smiling',
    'a photo of a child', 'a photo of a baby', 'a photo of a couple', 'a portrait of a person',
    'a landscape photo', 'a photo of the beach', 'a photo of mountains', 'a photo of a city street',
    'a travel photo of a monument', 'a photo of a building', 'a photo of a house', 'a photo of a garden',
    'a photo of food on a table', 'a photo of a pet', 'a photo of a dog', 'a photo of a cat',
    'a photo of a birthday party', 'a photo of a wedding', 'a photo taken at night', 'a photo of a car',
    'a photo of a room', 'a photo of a tree in a park', 'a photo of an object on a table', 'a photo of a machine',
    'a photo of a wall', 'a photo of a museum', 'a photo of a person standing outdoors', 'an old printed photograph',
  ],
  print: [
    'a screenshot of a phone screen', 'a screenshot of a mobile app', 'a screenshot of a chat conversation',
    'a screenshot of a website', 'a screenshot of a social media post', 'a screenshot of a map app',
    'a screenshot of a computer screen',
  ],
  documento: [
    'a photo of a document', 'a scanned document', 'a photo of a receipt', 'a photo of a paper form',
    'a photo of an invoice', 'a photo of an identity card', 'a page of printed text', 'a handwritten note on paper',
    'a photo of a whiteboard', 'a photo of a medical prescription', 'a photo of a contract', 'a photo of a bank slip with a barcode',
  ],
  propaganda: [
    'an advertisement', 'a promotional flyer', 'a poster announcing a sale', 'a banner ad with prices',
    'an invitation card', 'a product photo on a white background', 'a restaurant menu', 'an event poster',
  ],
  internet: [
    'a meme', 'a cartoon', 'a drawing', 'a digital illustration', 'an image with a quote in large letters',
    'a phone wallpaper', 'a logo', 'a sticker', 'a greeting card image with flowers and text',
  ],
};

const saida = process.argv[2] || 'clip-textos.json';
const tok = await AutoTokenizer.from_pretrained(MODELO, { revision: REVISAO });
const modelo = await CLIPTextModelWithProjection.from_pretrained(MODELO, { revision: REVISAO, dtype: 'fp32' });
const frases = [];
for (const [cat, lista] of Object.entries(FRASES)) {
  const entrada = tok(lista, { padding: true, truncation: true });
  const { text_embeds } = await modelo(entrada);
  const [n, d] = text_embeds.dims;
  for (let i = 0; i < n; i++) {
    const v = Array.from(text_embeds.data.slice(i * d, (i + 1) * d));
    const norma = Math.hypot(...v);
    frases.push({ cat, texto: lista[i], v: v.map((x) => Math.round((x / norma) * 1e5) / 1e5) });
  }
}
writeFileSync(saida, `${JSON.stringify({ modelo: MODELO, revisao: REVISAO, frases })}\n`);
console.log(`${frases.length} frases em ${saida}`);
