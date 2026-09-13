import { HttpAgent, type RunAgentInput } from '@ag-ui/client';

/**
 * HttpAgent always asks for SSE (`Accept: text/event-stream`).
 * This one asks for protobuf instead; the client already decodes it when the server agrees.
 */
export class ProtobufHttpAgent extends HttpAgent {
  // @live 5 begin: ask for protobuf
  protected override requestInit(input: RunAgentInput): RequestInit {
    const init = super.requestInit(input);
    return { ...init, headers: { ...init.headers, Accept: 'application/vnd.ag-ui.event+proto' } };
  }
  // @live 5 end
}
