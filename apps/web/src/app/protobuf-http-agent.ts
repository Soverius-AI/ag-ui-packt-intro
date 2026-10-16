import { HttpAgent, type RunAgentInput } from '@ag-ui/client';

/**
 * HttpAgent always asks for SSE (`Accept: text/event-stream`).
 * This one asks for protobuf instead; the client already decodes it when the server agrees.
 */
export class ProtobufHttpAgent extends HttpAgent {
  // ▶ step 5: ask for protobuf
  // ◀ step 5
}
