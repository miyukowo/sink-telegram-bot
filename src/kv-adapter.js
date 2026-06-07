export class KvAdapter {
  constructor(kvNamespace) {
    this.kv = kvNamespace;
  }

  async read(key) {
    if (!this.kv) return undefined;
    const value = await this.kv.get(key, 'json');
    return value === null ? undefined : value;
  }

  async write(key, data) {
    if (!this.kv) return;
    await this.kv.put(key, JSON.stringify(data), { expirationTtl: 86400 * 7 }); // 7 days ttl
  }

  async delete(key) {
    if (!this.kv) return;
    await this.kv.delete(key);
  }
}
