// Desempate durante o percurso do iCloud: as URLs das miniaturas do iCloud
// expiram em poucas horas, então cada miniatura que interessa é baixada e
// resumida (pHash) assim que o percurso a vê, e não depois.
//
// `wanted` são os itens do iCloud que a imagem decidiria (pares a confirmar ou
// reduzidos, candidatas a duplicata), calculados no último cruzamento.

export const thumbUrl = (u) => u.replace('${f}', 'thumb.jpg');

export class ThumbQueue {
  /**
   * @param {{ concurrency?: number, hash: (url: string) => Promise<string>, save: (patches: {id: string, phash: string}[]) => Promise<void>, batch?: number }} o
   */
  constructor({ concurrency = 8, hash, save, batch = 50 }) {
    Object.assign(this, { concurrency, hash, save, batchSize: batch });
    this.wanted = new Set();
    this.queue = [];
    this.seen = new Set();
    this.pending = [];
    this.active = 0;
    this.done = 0;
    this.failed = 0;
    this.expired = 0;
    this.idle = Promise.resolve();
    this._resolveIdle = null;
  }

  setWanted(ids) { this.wanted = new Set(ids); }

  /** Recebe itens recém-lidos; entram na fila os desejados, com miniatura e ainda sem pHash. */
  offer(items) {
    let n = 0;
    for (const it of items) {
      if (!it.thumb || it.phash || !this.wanted.has(it.id) || this.seen.has(it.id)) continue;
      this.seen.add(it.id);
      this.queue.push({ id: it.id, url: thumbUrl(it.thumb) });
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
      this.hash(it.url)
        .then((phash) => { this.pending.push({ id: it.id, phash }); this.done++; })
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

  stats() { return { done: this.done, failed: this.failed, expired: this.expired, queued: this.queue.length + this.active }; }
}
