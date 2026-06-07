export class SinkAPI {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = token;
  }

  async fetchApi(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const config = {
      ...options,
      headers,
    };

    const response = await fetch(url, config);
    const text = await response.text();
    
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  }

  // Links
  async createLink(data) {
    return this.fetchApi('/api/link/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async editLink(data) {
    return this.fetchApi('/api/link/edit', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async upsertLink(data) {
    return this.fetchApi('/api/link/upsert', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteLink(slug) {
    return this.fetchApi('/api/link/delete', {
      method: 'POST',
      body: JSON.stringify({ slug }),
    });
  }

  async queryLink(slug) {
    return this.fetchApi(`/api/link/query?slug=${encodeURIComponent(slug)}`, {
      method: 'GET',
    });
  }

  async searchLinks(query) {
    return this.fetchApi(`/api/link/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
    });
  }

  async listLinks(page = 1, limit = 10) {
    return this.fetchApi(`/api/link/list?page=${page}&limit=${limit}`, {
      method: 'GET',
    });
  }

  async exportLinks() {
    return this.fetchApi('/api/link/export', { method: 'GET' });
  }

  async importLinks(linksData) {
    return this.fetchApi('/api/link/import', {
      method: 'POST',
      body: JSON.stringify(linksData),
    });
  }

  async aiSlug(url) {
    return this.fetchApi(`/api/link/ai?url=${encodeURIComponent(url)}`, { method: 'GET' });
  }

  async aiOg(url, locale = 'en-US') {
    return this.fetchApi(`/api/link/og-ai?url=${encodeURIComponent(url)}&locale=${locale}`, { method: 'GET' });
  }

  async uploadImage(formData) {
    // Note: This endpoint expects FormData or binary, fetchApi wrapper might need adjustment
    // if sending FormData, but we'll pass headers inside options if needed.
    const url = `${this.baseUrl}/api/upload/image`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData,
    });
    return response.json();
  }

  async triggerBackup() {
    return this.fetchApi('/api/backup', { method: 'POST' });
  }

  // Analytics
  async getCounters() {
    return this.fetchApi('/api/stats/counters', { method: 'GET' });
  }

  async getMetrics(dimension) {
    return this.fetchApi(`/api/stats/metrics?dimension=${encodeURIComponent(dimension)}`, { method: 'GET' });
  }

  async getViews(timeframe = '7d') {
    return this.fetchApi(`/api/stats/views?timeframe=${timeframe}`, { method: 'GET' });
  }

  async getHeatmap() {
    return this.fetchApi('/api/stats/heatmap', { method: 'GET' });
  }

  async exportStats(startAt, endAt, slug) {
    let url = `/api/stats/export?startAt=${startAt}&endAt=${endAt}`;
    if (slug) url += `&slug=${encodeURIComponent(slug)}`;
    
    // We return raw text for CSV
    const response = await fetch(`${this.baseUrl}${url}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return response.text();
  }

  async getEvents() {
    return this.fetchApi('/api/logs/events', { method: 'GET' });
  }

  async getLocations() {
    return this.fetchApi('/api/logs/locations', { method: 'GET' });
  }
}
