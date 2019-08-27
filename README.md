# Webdav.js
A simple webdav library for browsers and node.js

Webdav.js is a Object-Oriented and Promise based client library for webdav servers. It allows inspecting, downloading and uploading files.
## Access restrictions for browsers (CORS)
In order for cross origin access to a webdav server to work, you need to set CORS appropriate headers. Otherwise this library won't work.

## Example
```javascript
import * as webdav from './webdav.js';

const url = 'http://localhost:8080/dav';
const client = new webdav.Client(url, {
  username: 'username',
  password: 'password',
});

(async function run() {
  const files = {
    'lyrics.txt': 'Oh, think twice',
    'youandme.txt': 'Another file in paradise',
  }

  const demofolder = await root.mkdir('demo');
  for (const [file, content] of Object.entries(files)) {
    await demofolder.upload(file, content);
  }

  const filelist = await demofolder.list();
  console.log(filelist);

  const downloads = Promise.all(filelist.map(async file=>await file.download()));
  for (const file of downloads) {
    console.log('Downloaded', file);
  }
})();
```

## API
### class Client:
#### constructor(server, options)
> Creates a new client instance.
#### async list(dir): Promise<Array<Entity>>
> List all entities in the given dir.
#### async get(href): Promise<Entity>
> Downloads a file given a href.
#### async getProgress(href): Promise<AyncIterable<Progress>>
> Downloads a file given a href. Reports Progress.
#### async put(href, data): Promise<File>
> Uploads some data to a file at the given a href.
#### async putProgress(href, data): Promise<AyncIterable<Progress>>
> Uploads some data to a file at the given a href. Reports Progress.
#### async move(href, loc): Promise<Entity>
> Moves the entity at href to a new location loc.
#### async delete(href): Promise
> Moves the entity at href.
#### async mkdir(href): Promise<Directory>
> Creates a directory at a given href.
#### async inspect(href): Promise<Entity>
> Inspects a given href.
#### async getRoot(): Promise<Array<Entity>>
> Inspects the servers root directory.
> This is a convenient entrypoint for the Object-Oriented model.
#### addTypeParser(type, parser(Response))
> Add a parsing function for a given mime-type. The parsing function should accept a Response instance and return the decoded data.

### class Entity
#### href: String
> The entities href
#### displayname: String
> The entities displayname
#### resourcetype: String
> The entities resourcetype
#### creationdate: Date
> The entities creation date
#### lastmodified: Date
> The entities last modification date
#### etag: String
> The entities etag
#### async getParent(): Promise<Directory>
> Gets the entities parent directory
#### async move(loc): Promise<Entity>
> Moves the entity to a new location
#### async rename(name): Promise<Entity>
> Renames the entity
#### async delete(): Promise
> Deletes the entity
#### async reload(): Promise<Entity>
> Reloads the entity by returning a new, updated one

### class Directory extends Entity:
#### name: String
> The directories name
#### async list(): Promise<Array<Entity>>
> Lists all files in this directory
#### async upload(name, data): Promise<File>
> Uploads a new file to this directory
#### async uploadWithProgress(name, data): Promise<AyncIterable<ProgressReport>>
> Uploads a new file to this directory. Reports Progress.
#### async mkdir(name): Promise<Directory>
> Created a new directory inside this one

### class File extends Entity:
#### name: String
> The files name
#### contentlength: Number
> The files length (in Bytes)
#### contenttype: String
> The files mime-type
#### async download(): Promise<content>
> Downloads the file contents and decodes it using a TypeParser (see Client:addTypeParser).
#### async downloadWithProgress(): Promise<AyncIterable<ProgressReport>>
> Downloads the file contents. Reports Progress.
#### async update(data): Promise<File>
> Updates the files contents.
#### async updateWithProgress(data): Promise<AyncIterable<ProgressReport>>
> Updates the files contents. Reports Progress

### ProgressReport
#### upload: Number 0<x<1,
> The transactions upload progress in percent
#### download: Number 0<x<1,
> The transactions download progress in percent
#### done: Boolean,
> Flag if the transaction is done
#### error: Error | undefined,
> If an error occured, this field will be set to that error
#### request: XMLHttpRequest,
> The underlying XMLHttpRequest instance
