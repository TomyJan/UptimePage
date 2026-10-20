import serverConfig from '../../../.generated/server-config.ts';
import { handleApi } from '../../../src/server/api.ts';
import type { ServerConfig } from '../../../src/server/config.ts';

type EdgeContext = {
  request: Request;
  env?: Record<string, string | undefined>;
};

export default function onRequest(context: EdgeContext) {
  return handleApi(context.request, {
    config: serverConfig as ServerConfig,
    environment: context.env ?? {},
  });
}
