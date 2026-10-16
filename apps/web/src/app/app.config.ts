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
        // ▶ step 4: our Gemma agent, over SSE
        default: new HttpAgent({ url: `${AGENT}/agui` }),
        // ◀ step 4
        // ▶ step 5: the same agent, binary wire format
        // ◀ step 5
        abo: new HttpAgent({ url: `${AGENT}/abo` }), // Abo-Killer, from step 6 on
      },
      enableInspector: false,
    }),
    provideCopilotChatLabels({ chatInputPlaceholder: 'Ask your teammate…' }),
  ],
};
