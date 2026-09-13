import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { HttpAgent } from '@ag-ui/client';
import { provideCopilotChatLabels, provideCopilotKit } from '@copilotkit/angular';
import { routes } from './app.routes';
import { ProtobufHttpAgent } from './protobuf-http-agent';

const AGENT = 'http://localhost:8930';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    // CopilotKit talks to our AG-UI agents directly, with no CopilotRuntime in between (dev mode).
    provideCopilotKit({
      agents: {
        // @live 4 begin: our Gemma agent, over SSE
        default: new HttpAgent({ url: `${AGENT}/agui` }),
        // @live 4 end
        // @live 5 begin: the same agent, binary wire format
        protobuf: new ProtobufHttpAgent({ url: `${AGENT}/agui` }),
        // @live 5 end
        abo: new HttpAgent({ url: `${AGENT}/abo` }), // Abo-Killer, from step 6 on
      },
      enableInspector: false,
    }),
    provideCopilotChatLabels({ chatInputPlaceholder: 'Ask your teammate…' }),
  ],
};
