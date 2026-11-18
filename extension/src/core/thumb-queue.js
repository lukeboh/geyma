// Miniaturas do iCloud durante o percurso: as URLs expiram em poucas horas,
// então cada miniatura que interessa é baixada assim que o percurso a vê, e
// não depois. Uma única descarga serve aos dois usos:
//
// - `phash`: itens que a imagem decidiria (pares a confirmar ou reduzidos,
//   candidatas a duplicata); guarda só a impressão digital.
// - `keep`: itens que só existem no iCloud ou são cópias repetidas nele; guarda
//   a própria miniatura no notebook, para a revisão funcionar depois que a
//   URL expirar.
//
// Foto editada no iCloud (tem thumbOrig): a miniatura é a da versão atual. Para
// a impressão digital, as duas versões contam (o Google pode ter guardado
// qualquer uma): phash da atual e phashOrig do original, com phashV = 2. Uma
// miniatura guardada por versões antigas da extensão é a do original; essas
// (keepIfEdited) são trocadas pela atual quando o percurso passa pela foto.

export const thumbUrl = (u) => u.replace('${f}', 'thumb.jpg');

export class ThumbQueue {
  /**
   * @param {{ concurrency?: number, batch?: number,
   *   work: (url: string, need: {phash: boolean, keep: boolean}, urlOrig?: string|null) => Promise<object>,
   *   save: (results: object[]) => Promise<void> }} o
   *   `work` devolve os campos obtidos ({phash, phashOrig?, phashV}, {blob} ou ambos); `save` grava um lote de {id, ...campos}.
   */
  constructor({ concurrency = 8, work, save, batch = 50 }) {
    Object.assign(this, { concurrency, work, save, batchSize: batch });
    this.phashIds = new Set();
    this.keepIds = new Set();
    this.keepIfEdited = new Set();
    this.queue = [];
    this.seen = new Set();
    this.pending = [];
    this.active = 0;
    this.done = 0;
    this.kept = 0;
    this.failed = 0;
    this.expired = 0;
    this.idle = Promise.resolve();
    this._resolveIdle = null;
  }

  /** Quais itens precisam da impressão digital e quais devem ter a miniatura guardada. */
  setWanted(phashIds = [], keepIds = [], keepIfEdited = []) {
    this.phashIds = new Set(phashIds);
    this.keepIds = new Set(keepIds);
    this.keepIfEdited = new Set(keepIfEdited);
  }

  /** Recebe itens recém-lidos; entram na fila os que têm miniatura e ainda precisam de algo. */
  offer(items) {
    let n = 0;
    for (const it of items) {
      if (!it.thumb || this.seen.has(it.id)) continue;
      const editada = Boolean(it.thumbOrig);
      const need = {
        phash: this.phashIds.has(it.id) && (!it.phash || (editada && it.phashV !== 2)),
        keep: this.keepIds.has(it.id) || (editada && this.keepIfEdited.has(it.id)),
      };
      if (!need.phash && !need.keep) continue;
      this.seen.add(it.id);
      this.queue.push({ id: it.id, url: thumbUrl(it.thumb), urlOrig: editada ? thumbUrl(it.thumbOrig) : null, editada, need });
      n++;
    }
    if (n) this._pump();
    return n;
  }

  _pump() {
    if (!this._resolveIdle && (this.queue.length || this.active)) this.idle = new Promise((r) => { this._resolveIdle = r; });
    while (this.active < this.concurrency && this.queue.length) {
      const it = this.queue.shift();
      this.active++;
      this.work(it.url, it.need, it.urlOrig)
        .then((got) => {
          this.pending.push({ id: it.id, ...(it.editada ? { editada: true } : {}), ...got });
          if (got.phash) this.done++;
          if (got.blob) this.kept++;
        })
        .catch((err) => { this.failed++; if ([401, 403, 404, 410].includes(err?.status)) this.expired++; })
        .finally(async () => {
          this.active--;
          if (this.pending.length >= this.batchSize || (!this.queue.length && !this.active)) await this.flush();
          if (this.queue.length) this._pump();
          else if (!this.active && this._resolveIdle) { const r = this._resolveIdle; this._resolveIdle = null; r(); }
        });
    }
  }

  async flush() {
    if (!this.pending.length) return;
    const b = this.pending;
    this.pending = [];
    await this.save(b);
  }

  stats() { return { done: this.done, kept: this.kept, failed: this.failed, expired: this.expired, queued: this.queue.length + this.active }; }
}
