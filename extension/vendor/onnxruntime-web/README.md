# onnxruntime-web 1.30.0

Cópia de `dist/ort.wasm.bundle.min.mjs` e `dist/ort-wasm-simd-threaded.wasm` do
pacote npm `onnxruntime-web@1.30.0` (Microsoft, licença MIT,
https://github.com/microsoft/onnxruntime/blob/main/LICENSE). Roda o modelo de
imagem do CLIP no worker do painel (`src/clip-worker.js`), sem baixar código
da internet.

Para atualizar: `npm i onnxruntime-web@<versão>` numa pasta temporária e copiar
os dois arquivos acima.
