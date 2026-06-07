export class KvAdapter {
  constructor(kvNamespace) {
    this.kv = kvNamespace;
  }

  async read(key) {
    if (!this.kv || typeof this.kv.get !== 'function') return undefined;
    try {
      const valueStr = await this.kv.get(key);
      if (!valueStr) return undefined;
      return JSON.parse(valueStr);
    } catch (e) {
      console.error("KV Read Error:", e);
      return undefined;
    }
  }

  async write(key, data) {
    if (!this.kv || typeof this.kv.put !== 'function') return;
    try {
      await this.kv.put(key, JSON.stringify(data), { expirationTtl: 86400 * 7 });
    } catch (e) {
      console.error("KV Write Error:", e);
    }
  }

  async delete(key) {
    if (!this.kv || typeof this.kv.delete !== 'function') return;
    try {
      await this.kv.delete(key);
    } catch (e) {
      console.error("KV Delete Error:", e);
    }
  }
}
