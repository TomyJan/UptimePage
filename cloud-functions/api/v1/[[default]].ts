import serverConfig from '../../../.generated/server-config.ts';
import { createCloudApiHandler, type FunctionContext } from '../../../src/server/cloud-runtime.ts';
import type { ServerConfig } from '../../../src/server/config.ts';

const handler = createCloudApiHandler(serverConfig as ServerConfig);

export default function onRequest(context: FunctionContext) {
  return handler(context);
}
