if (typeof require === 'function') {
  var JSDOM = require('jsdom').JSDOM;
  var DOMParser = new JSDOM().window.DOMParser;
  var fetch = require('node-fetch');
  var btoa = require('btoa');
  var XMLHttpRequest = require('xhr2');
}

const parseXML = txt => {
  txt = txt.split('<d:').join('<'); // TODO FIX JSDOM NAMESPACES https://github.com/jsdom/jsdom/issues/2159#issuecomment-466220495
  txt = txt.split('</d:').join('</');
  txt = txt.split('<D:').join('<');
  txt = txt.split('</D:').join('</');
  txt = txt.split('<DAV:').join('<');
  txt = txt.split('</DAV:').join('</');
  return new DOMParser().parseFromString(txt, 'text/xml');
}
const parseHTML = txt => {
  return new DOMParser().parseFromString(txt, 'text/html');
}

class WebdavError extends Error {
    constructor(code, message, ...args) {
        super(code + ' ' + message, ...args);
        this.code = code;
    }
}

class Entity {
  get href() {
    return this._href.textContent;
  }
  get displayname() {
    return decodeURIComponent(this._doc.querySelector('displayname').textContent);
  }
  get resourcetype() {
    return this._doc.querySelector('resourcetype collection') ? 'collection' : 'file';
  }
  get creationdate() {
    return new Date(this._doc.querySelector('creationdate').textContent);
  }
  get lastmodified() {
    return new Date(this._doc.querySelector('getlastmodified').textContent);
  }
  get etag() {
    this._doc.querySelector('getetag').textContent;
  }
  constructor(href, doc, client) {
    this._href = href;
    this._doc = doc;
    this._client = client;
  }
  async getParent() {
    return await this._client.inspect(new URL('..', this.href));
  }
  async move(loc) {
    await this._client.move(this.href, loc);
    return await this._client.inspect(loc);
  }
  async rename(name) {
    if (this.href.endsWith('/')) name = '../' + name;
    const newhref = new URL(name, this.href);
    await this.move(newhref);
    return await this._client.inspect(newhref);
  }
  async delete() {
    await this._client.delete(this.href);
  }
  async reload() {
    return await this._client.inspect(this.href);
  }
}

export class Directory extends Entity {
  get name() {
    const h = this.href.slice(0,-1);
    const name = h.substring(h.lastIndexOf('/')+1);
    return decodeURIComponent(name);
  }
  async list() {
    return await this._client.list(this.href);
  }
  async upload(name, data) {
    const href = this.href + name;
    await this._client.put(href, data);
    return await this._client.inspect(href);
  }
  async uploadWithProgress(name, data) {
    const href = this.href + name;
    return await this._client.putProgress(href, data);
  }
  async mkdir(name) {
    const href = this.href + name;
    await this._client.mkdir(href);
    return await this._client.inspect(href);
  }
}

export class File extends Entity {
  get name() {
    const name = this.href.substring(this.href.lastIndexOf('/')+1);
    return decodeURIComponent(name);
  }
  get contentlength() {
    return Number(this._doc.querySelector('getcontentlength').textContent);
  }
  get contenttype() {
    return this._doc.querySelector('getcontenttype').textContent;
  }
  async download() {
    return await this._client.get(this.href);
  }
  async downloadWithProgress() {
    return await this._client.getProgress(this.href);
  }
  async update(data) {
    await this._client.put(this.href, data);
    return await this._client.inspect(this.href);
  }
  async updateWithProgress(data) {
    return await this._client.putProgress(this.href, data);
  }
}

export class Client {
  constructor(server, options) {
    if (!server.endsWith('/')) server = server + '/';
    this.options = {
      server,
      ...options,
    }

    this.types = {
      'text/plain': res => res.text(),
      'application/xml': res => res.text().then(parseXML),
      'application/html': res => res.text().then(parseHTML),
      'application/json': res => res.json(),
    };
  }

  createEntity(response) {
    const href = response.querySelector('href');
    const prop = response.querySelector('prop');
    const Entity = prop.querySelector('resourcetype collection') ? Directory : File;
    return new Entity(href, prop, this);
  }

  async list(dir) {
    const res = await this.request('PROPFIND', dir, {depth: 1});
    const responses = res.querySelectorAll('response:not(:first-child)');
    const ret = [];
    [].forEach.call(responses, r => {
      ret.push(this.createEntity(r));
    });
    return ret;
  }

  async get(href) {
    return await this.request('GET', href);
  }

  async getProgress(href) {
    return this.requestXHRProgress('GET', href);
  }

  async put(href, data) {
    return await this.request('PUT', href, {}, data);
  }

  async putProgress(href, data) {
    return this.requestXHRProgress('PUT', href, {}, data);
  }

  async move(href, loc) {
    const newhref = new URL(loc, new URL(href, this.options.server));
    return await this.request('MOVE', href, {Destination: newhref});
  }

  async delete(href) {
    return await this.request('DELETE', href)
  }

  async mkdir(href) {
    return await this.request('MKCOL', href);
  }

  async inspect(href) {
    const res = await this.request('PROPFIND', href, {depth: 0});
    return this.createEntity(res.querySelector('response'));
  }

  async getRoot() {
    return await this.inspect('./');
  }

  async getAuthHeader() {
    if (!this.authHeader)
      this.authHeader = 'Basic ' + btoa(this.options.username + ':' + this.options.password);
    return this.authHeader;
  }

  async request(method, path, headers={}, body, raw=false) {
    const res = await fetch(new URL(path, this.options.server), {
      method: method,
      body: body,
      headers: {
        Authorization: await this.getAuthHeader(),
        ...headers,
      }
    });

    if (!res.ok) throw new WebdavError(res.status, res.statusText);

    if (raw) return res;
    if (!res.headers.has('content-type')) return res.status;

    const contentType = res.headers.get('content-type') || '';

    for (const type of Object.keys(this.types)) {
      if (contentType.includes(type)) return this.types[type](res);
    }

    return await res.text();
  }

  async requestXHR(method, path, headers={}) {
    const req = new XMLHttpRequest();
    req.open(method, (new URL(path, this.options.server)).href);

    req.overrideMimeType("text/plain");

    headers = {
      Authorization: await this.getAuthHeader(),
      ...headers,
    };
    for (const header of Object.entries(headers)) {
      req.setRequestHeader(header[0], [header[1]]);
    }

    return req;
  }

  async *requestXHRProgress(method, path, headers={}, body) {
    const req = await this.requestXHR(method, path, headers);
    let uComplete = typeof body === 'undefined';
    let dComplete = false;
    let error = undefined;
    let res = ()=>{};
    let p = new Promise((r)=>res = r);
    let update = (e, s)=>{
      error = e;
      res(s);
      p = new Promise((r)=>res = r);
    };

    req.upload.addEventListener('progress', e => {
      const s = e.lengthComputable ? e.loaded / e.total : -1;
      update(undefined, s);
    });
    req.upload.addEventListener("load", ()=>{
      uComplete = true;
      update(undefined, 1);
    });
    req.upload.addEventListener("error", e => update(e, 0));
    req.upload.addEventListener("abort", e => update(e, 0));
    req.addEventListener('progress', e => {
      const s = e.lengthComputable ? e.loaded / e.total : -1;
      update(undefined, s);
    });
    req.addEventListener("load", ()=>{
      dComplete = true;
      update(undefined, 1);
    });
    req.addEventListener("error", e => update(e, 0));
    req.addEventListener("abort", e => update(e, 0));

    yield {
      upload: 0,
      download: 0,
      done: false,
      error: undefined,
      request: req,
    };
    req.send(body);

    while(!dComplete) {
      const s = await p;
      yield {
        upload: !uComplete ? s : 1,
        download: uComplete ? s : 0,
        done: dComplete,
        error: error,
        request: req,
      };
    }
  }

  addTypeParser(type, parser) {
    this.types[type] = parser;
  }
}
