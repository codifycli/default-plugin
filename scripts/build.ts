import { JSONSchema } from '@apidevtools/json-schema-ref-parser';
import { createRequire } from 'node:module';
import { Ajv } from 'ajv';
import { VerbosityLevel } from '@codifycli/plugin-core';
import { SequentialPty } from '@codifycli/plugin-core';
import { IpcMessage, IpcMessageSchema, MessageStatus, ResourceSchema } from '@codifycli/schemas';
import mergeJsonSchemas from 'merge-json-schemas';
import { ChildProcess, fork } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as url from 'node:url';

const ajv = new Ajv({
  strict: true
});
const ipcMessageValidator = ajv.compile(IpcMessageSchema);

function sendMessageAndAwaitResponse(process: ChildProcess, message: IpcMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    process.on('message', (response: IpcMessage) => {
      if (!ipcMessageValidator(response)) {
        throw new Error(`Invalid message from plugin. ${JSON.stringify(message, null, 2)}`);
      }

      // Wait for the message response. Other messages such as sudoRequest may be sent before the response returns
      if (response.cmd === message.cmd + '_Response') {
        if (response.status === MessageStatus.SUCCESS) {
          resolve(response.data)
        } else {
          reject(new Error(String(response.data)))
        }
      }
    });

    // Send message last to ensure listeners are all registered
    process.send(message);
  });
}

VerbosityLevel.set(3);
const $ = new SequentialPty();

await $.spawn('rm -rf ./dist')
await $.spawn('npm run rollup -- -f es', { interactive: true });

const plugin = fork(
  './dist/index.js',
  [],
  {
    // Use default true to test plugins in secure mode (un-able to request sudo directly)
    detached: true,
    env: { ...process.env },
    execArgv: ['--import', 'tsx/esm'],
  },
)

const initializeResult = await sendMessageAndAwaitResponse(plugin, {
  cmd: 'initialize',
  data: {}
})

const { resourceDefinitions } = initializeResult;
const resourceTypes = resourceDefinitions.map((i) => i.type);

const schemasMap = new Map<string, JSONSchema>()
const metadataList: Record<string, unknown>[] = [];
for (const type of resourceTypes) {
  const resourceInfo = await sendMessageAndAwaitResponse(plugin, {
    cmd: 'getResourceInfo',
    data: { type }
  })

  schemasMap.set(type, resourceInfo.schema);

  const { schema: _schema, ...metadataWithoutSchema } = resourceInfo;
  metadataList.push(metadataWithoutSchema);
}

const mergedSchemas = [...schemasMap.entries()].map(([type, schema]) => {
    // const resolvedSchema = await $RefParser.dereference(schema)
    const resourceSchema = JSON.parse(JSON.stringify(ResourceSchema));

    delete resourceSchema.$id;
    delete resourceSchema.$schema;
    delete resourceSchema.title;
    delete resourceSchema.oneOf;
    delete resourceSchema.properties.type;

    if (schema) {
      delete schema.$id;
      delete schema.$schema;
      delete schema.title;
      delete schema.oneOf;
    }

    return mergeJsonSchemas([schema ?? {}, resourceSchema, { properties: { type: { const: type, type: 'string' } } }]);
  });


await $.spawn('rm -rf ./dist')
await $.spawn('npm run rollup', { interactive: true }); // re-run rollup without building for es

console.log('Generated JSON Schemas for all resources')

const require = createRequire(import.meta.url);
const rawSchema = require('./raw-codify-schema.json');

const codifySchema = {
  ...rawSchema,
  items: {
    oneOf: [
      ...rawSchema.items.oneOf,
      ...mergedSchemas,
    ]
  }
};

const distFolder = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'dist');
const schemaOutputPath = path.resolve(distFolder, 'schemas.json');
fs.writeFileSync(schemaOutputPath, JSON.stringify(codifySchema, null, 2));

console.log('Successfully wrote schema to ./dist/schemas.json')

const metadataOutputPath = path.resolve(distFolder, 'metadata.json');
fs.writeFileSync(metadataOutputPath, JSON.stringify(metadataList, null, 2));
console.log('Successfully wrote metadata to ./dist/metadata.json')


plugin.kill(9);
process.exit(0);

