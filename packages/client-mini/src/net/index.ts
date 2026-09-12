/**
 * @farm-game/client-mini/net — public network layer.
 *
 * W2 (runtime) imports from here; nothing inside `./net/*` should be reached
 * directly. The two halves are intentionally co-located so the contract
 * between the HTTP login and the WS join stays obvious.
 */

export {
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
  autoHttpTransport,
  nodeHttpTransport,
  wxHttpTransport,
} from './transport.js';

export {
  FarmApiError,
  FarmHttpClient,
  type FarmHttpClientOptions,
  unwrapEnvelope,
} from './http.js';

export {
  buildFarmCmdEnvelope,
  buildFarmRefreshEnvelope,
  makeOperationId,
  parseWelcomeEnvelope,
  wxWebSocketFactory,
  FarmRealtimeClient,
  FarmWsError,
  type WelcomePayload,
  type CmdResultPayload,
  type FarmRealtimeClientOptions,
} from './ws.js';
