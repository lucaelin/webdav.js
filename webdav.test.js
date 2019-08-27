import * as webdav from './webdav.js';
import * as chai from 'chai';

const url = 'http://localhost:8080/dav';
const client = new webdav.Client(url, {
  username: 'username',
  password: 'password',
});

/*
const url = 'https://demo.owncloud.org/remote.php/dav/files/demo/';
const client = new webdav.Client(url, {
  username: 'demo',
  password: 'demo',
});
*/

describe('client', () => {
  it('getRoot', async () => {
    const root = await client.getRoot();
    chai.expect(root).to.have.property('href');
  });

  it('list', async () => {
    const list = await client.list('');
    chai.expect(list).to.be.an('array');
  });

  it('mkdir', async () => {
    await client.mkdir('test');
    const list = await client.list('');
    const names = list.filter(e => e instanceof webdav.Directory).map(d => d.displayname)
    chai.expect(names).to.include.members(['test']);
  });

  it('folder exists error', async () => {
    const error = await client.mkdir('test').catch(e => e);
    chai.expect(error).to.be.an('error');
  });

  it('put, get', async () => {
    await client.put('test/test.txt', 'test123');
    const file = await client.get('test/test.txt');
    chai.expect(file).to.equal('test123');
  });

  it('putProgress, getProgress', async () => {
    let body = ''+Math.random();
    for (let i = 0; i < 1*1024*512; i++) {
      body += String.fromCharCode(Math.floor(Math.random() * 255));
    }
    const pReq = await client.putProgress('test/testProgress.txt', body);
    let pLast;
    for await (const p of pReq) {
      pLast = p;
    }
    chai.expect(pLast.done).to.be.true;
    const gReq = await client.getProgress('test/testProgress.txt');
    let gLast;
    for await (const p of gReq) {
      gLast = p;
    }
    chai.expect(gLast.done).to.be.true;
    chai.expect(gLast.request.responseText).to.be.equal(body);
  }).timeout(0);

  it('inspect', async () => {
    const file = await client.inspect('test/test.txt');
    chai.expect(file).to.be.instanceof(webdav.File);
    chai.expect(file).to.have.property('displayname').equal('test.txt');
  });

  it('inspect no exist error', async () => {
    const error = await client.inspect('test/test2.txt').catch(e => e);
    chai.expect(error).to.be.an('error');
  });

  it('move', async () => {
    await client.move('test/test.txt', 'test/test2.txt');
    const file = await client.get('test/test2.txt');
    chai.expect(file).to.equal('test123');
  });

  it('delete', async () => {
    await client.delete('test');
    const list = await client.list('');
    const names = list.filter(e => e instanceof webdav.Directory).map(d => d.displayname)
    chai.expect(names).to.not.include.members(['test']);
  });

  it('types', async () => {
    const obj = {
      a: true,
      b: 2,
      c: '3',
    };
    await client.put('test.json', JSON.stringify(obj));
    const file = await client.get('test.json');
    await client.delete('test.json');
    chai.expect(file).to.be.an('object');
    chai.expect(file).to.deep.equal(obj);
  });
});


describe('Files and Directories', () => {
  let root;

  it('getRoot', async () => {
    root = await client.getRoot();
    chai.expect(root).to.have.property('displayname');
  });

  it('list, Directory, File', async () => {
    const dirs = ['test1', 'test2', 'test3'];
    const files = ['test1.txt', 'test2.txt', 'test3.txt']

    const list = await root.list();
    for (const dir of dirs) {
      await client.mkdir(dir);
    }
    for (const file of files) {
      await client.put(file, 'test123');
    }

    const list2 = await root.list();

    for (const dir of dirs) {
      await client.delete(dir);
    }
    for (const file of files) {
      await client.delete(file);
    }

    chai.expect(list2).to.be.an('array');
    chai.expect(list2).to.have.length.of.least(dirs.length + files.length);
    chai.expect(list2.filter(e=>e instanceof webdav.Directory)).to.have.length.of.least(dirs.length);
    chai.expect(list2.filter(e=>e instanceof webdav.File)).to.have.length.of.least(files.length);
  });

  it('upload, delete', async () => {
    const list0 = await root.list();
    await root.upload('test.txt', 'testi');
    const list1 = await root.list();
    await list1.filter(e=>e.displayname==='test.txt')[0].delete();
    const list2 = await root.list();
    chai.expect(list0.filter(e=>e.displayname==='test.txt')).to.have.lengthOf(0);
    chai.expect(list1.filter(e=>e.displayname==='test.txt')).to.have.lengthOf(1);
    chai.expect(list2.filter(e=>e.displayname==='test.txt')).to.have.lengthOf(0);
  });

  it('href, displayname, resourcetype, creationdate, lastmodified, etag, contentlength, contenttype', async () => {
    await root.upload('test.txt', 'testi');
    const list = await root.list();
    const file = await list.filter(e=>e.displayname==='test.txt')[0];
    file.delete();

    chai.expect(file.href).to.be.equal(url + '/test.txt');
    chai.expect(file.displayname).to.be.equal('test.txt');
    chai.expect(file.resourcetype).to.be.equal('file');
    const start = new Date(Date.now() - 24*60*60*1000);
    const end = new Date(Date.now() + 24*60*60*1000);
    chai.expect(file.creationdate).to.be.within(start, end);
    chai.expect(file.lastmodified).to.be.within(start, end);
    chai.expect(file.etag).to.be.a.string;
    chai.expect(file.contentlength).to.be.equal(5);
    chai.expect(file.contenttype).to.be.equal('text/plain; charset=utf-8');
  });

  it('getParent, move, rename, delete, reload', async () => {
    const firstContent = 'testitest';
    const secondContent = 'testitestitest';

    const dir1 = await root.mkdir('test');
    const file1 = await root.upload('test.txt', firstContent);
    const file2 = await file1.move('test/test.txt');
    const dir2 = await file2.getParent();
    const file3 = await file2.rename('test2.txt');
    const file4 = await file1.update(secondContent);
    const file5 = await file3.reload();
    const file5Content = await file5.download();
    await file4.delete();
    await dir.delete();

    chai.expect(file5Content).to.equal(secondContent);

    const check = ['href', 'displayname', 'creationdate', 'lastmodified'];
    check.forEach(i =>
      chai.expect(dir1[i].toString()).to.equal(dir2[i].toString())
    );
    check.forEach(i =>
      chai.expect(file5[i].toString()).to.equal(file4[i].toString())
    );
  });
});
